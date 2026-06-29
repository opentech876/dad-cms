import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = ['owner', 'chef_equipe', 'editeur', 'charge_communication', 'presidence', 'chef_equipe_commerciale'];
const VALID_ACTIONS = [
  'update_role',
  'block',
  'unblock',
  'remove',
  'set_password',
  'resend_invitation',
  'revoke_invitation',
];

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Authorization header manquant');
    const token = authHeader.replace('Bearer ', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Token invalide ou expiré');

    const { userId, action, role, password, workspace_id } = await req.json();

    if (!userId) throw new Error("L'identifiant utilisateur est requis");
    if (!action || !VALID_ACTIONS.includes(action)) throw new Error('Action invalide');
    if (userId === user.id) throw new Error('Vous ne pouvez pas modifier votre propre compte');
    if (!workspace_id || typeof workspace_id !== 'string') {
      throw new Error("L'identifiant de l'espace de travail est requis");
    }

    // Per-workspace authorization: the caller must be owner of THIS workspace.
    // The previous global user_roles check let a user who was owner anywhere
    // act as owner everywhere — incompatible with real multi-tenancy.
    const { data: callerMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!callerMembership || callerMembership.role !== 'owner') {
      throw new Error('Accès refusé : rôle owner requis pour cet espace de travail');
    }

    // The target user must also be a member of THIS workspace — owners of
    // workspace A cannot reach into workspace B's members.
    const { data: targetMembership } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspace_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!targetMembership) {
      throw new Error("L'utilisateur cible n'appartient pas à cet espace de travail");
    }

    switch (action) {
      case 'update_role': {
        if (!role || !VALID_ROLES.includes(role)) throw new Error('Rôle invalide');
        // Per-workspace role lives on workspace_members. The legacy user_roles
        // table is kept around (bootstrap path) but is no longer authoritative
        // for active members of a workspace.
        const { error } = await supabase
          .from('workspace_members')
          .update({ role })
          .eq('workspace_id', workspace_id)
          .eq('user_id', userId);
        if (error) throw error;
        break;
      }
      case 'block': {
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: '876600h',
        });
        if (error) throw error;
        break;
      }
      case 'unblock': {
        const { error } = await supabase.auth.admin.updateUserById(userId, {
          ban_duration: 'none',
        });
        if (error) throw error;
        break;
      }
      case 'remove': {
        // Soft-remove from this workspace only. The auth.users row stays so
        // every `created_by` reference on past content keeps resolving. A
        // separate (future) system-admin action will handle full account
        // erasure (GDPR) for cases where that's actually required.
        const { error } = await supabase
          .from('workspace_members')
          .delete()
          .eq('workspace_id', workspace_id)
          .eq('user_id', userId);
        if (error) throw error;
        break;
      }
      case 'set_password': {
        if (!password || typeof password !== 'string' || password.length < 8) {
          throw new Error('Le mot de passe doit comporter au moins 8 caractères');
        }
        const { error } = await supabase.auth.admin.updateUserById(userId, { password });
        if (error) throw error;
        break;
      }
      case 'resend_invitation': {
        // Look up the user's email + confirmation state. We only resend for
        // invitees who haven't accepted yet — sending a magic link to a
        // confirmed user would just create login friction.
        const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
        if (getErr || !target?.user) throw new Error("Utilisateur introuvable");
        if (target.user.email_confirmed_at) {
          throw new Error("Cet utilisateur a déjà accepté son invitation");
        }
        const email = target.user.email;
        if (!email) throw new Error("L'utilisateur n'a pas d'adresse e-mail");
        const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: { role: targetMembership.role, workspace_id },
        });
        if (error) throw error;
        break;
      }
      case 'revoke_invitation': {
        // Only valid for unconfirmed invitees. We remove the workspace_members
        // row AND the auth.users row since they have no work attached
        // (`created_by` references are impossible without a confirmed login).
        const { data: target, error: getErr } = await supabase.auth.admin.getUserById(userId);
        if (getErr || !target?.user) throw new Error("Utilisateur introuvable");
        if (target.user.email_confirmed_at) {
          throw new Error("Cet utilisateur a déjà accepté — utilisez 'Retirer du workspace' à la place");
        }
        const { error: delMemberErr } = await supabase
          .from('workspace_members')
          .delete()
          .eq('workspace_id', workspace_id)
          .eq('user_id', userId);
        if (delMemberErr) throw delMemberErr;

        // If this was their only membership, also delete the auth user so
        // the email is free to be re-invited later.
        const { data: remaining } = await supabase
          .from('workspace_members')
          .select('user_id')
          .eq('user_id', userId)
          .limit(1);
        if (!remaining || remaining.length === 0) {
          const { error: delAuthErr } = await supabase.auth.admin.deleteUser(userId);
          if (delAuthErr) throw delAuthErr;
        }
        break;
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
