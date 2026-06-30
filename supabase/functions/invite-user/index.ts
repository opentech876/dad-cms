import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = [
  'owner',
  'chef_equipe',
  'editeur',
  'charge_communication',
  'presidence',
  'chef_equipe_commerciale',
];

// Roles a workspace owner / chef_equipe is NEVER allowed to mint via this
// flow. `owner` and `system_admin` are platform-management concerns:
//   • `owner` (UI: "Administrateur" of a workspace) is reserved for
//     system_admin — the platform admin chooses who runs each workspace.
//   • `system_admin` is not invitable from this endpoint at all; it's only
//     ever seeded via bootstrap.sql or promoted by an existing sysadmin.
const WORKSPACE_INVITER_FORBIDDEN_ROLES = ['owner', 'system_admin'];

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

    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, expires_at')
      .eq('user_id', user.id)
      .single();

    if (!roleData || !['system_admin', 'owner', 'chef_equipe'].includes(roleData.role)) {
      throw new Error('Accès refusé : rôle insuffisant');
    }
    if (roleData.expires_at && new Date(roleData.expires_at) < new Date()) {
      throw new Error('Session expirée — reconnectez-vous');
    }

    const isSysadmin = roleData.role === 'system_admin';

    const { email, role, redirectTo, workspace_id } = await req.json();

    if (!email?.trim()) throw new Error("L'adresse e-mail est requise");
    if (!role || !VALID_ROLES.includes(role)) throw new Error('Rôle invalide');
    if (!workspace_id || typeof workspace_id !== 'string') {
      throw new Error("L'identifiant de l'espace de travail est requis");
    }

    // Role-mint authorization (the meat of the "who can grant what" rule):
    //   • system_admin invites only `owner` (the "Administrateur" of a
    //     workspace, called Manager-tier in the UI labels we use elsewhere).
    //   • workspace inviters (owner / chef_equipe) cannot mint `owner` or
    //     `system_admin` — platform-management roles stay platform-managed.
    if (isSysadmin && role !== 'owner') {
      throw new Error(
        "Un administrateur plateforme ne peut inviter qu'un Administrateur d'espace",
      );
    }
    if (!isSysadmin && WORKSPACE_INVITER_FORBIDDEN_ROLES.includes(role)) {
      throw new Error(
        "Seul un administrateur plateforme peut désigner un Administrateur d'espace",
      );
    }

    // Per-workspace membership check. system_admin is platform-level and is
    // by design NOT a member of the workspaces it manages — skip the check
    // for them. Workspace inviters must still be owner/chef_equipe of the
    // target workspace, so an owner of workspace A can't invite into B.
    if (!isSysadmin) {
      const { data: inviterMembership } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace_id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!inviterMembership || !['owner', 'chef_equipe'].includes(inviterMembership.role)) {
        throw new Error(
          "Vous devez être propriétaire ou chef d'équipe de cet espace pour y inviter quelqu'un",
        );
      }
    }

    // Send the invite. Stash the role + workspace_id in user_metadata so the
    // signup trigger has them available if needed (defensive — the actual
    // workspace_members insert happens below, atomically).
    const { data: invite, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: { role, workspace_id },
        ...(redirectTo ? { redirectTo } : {}),
      },
    );

    if (inviteError) throw inviteError;
    if (!invite?.user?.id) throw new Error("Création de l'utilisateur invité échouée");

    // Critical: link the invited user to the workspace immediately. Without
    // this, get_my_workspace_ids() returns empty for them and every RLS
    // policy denies access — so they'd log in to an empty CMS.
    const { error: linkError } = await supabase.from('workspace_members').upsert(
      {
        workspace_id,
        user_id: invite.user.id,
        role,
      },
      { onConflict: 'workspace_id,user_id' },
    );

    if (linkError) {
      // Best-effort cleanup: if linking fails we shouldn't leave a half-created
      // user behind. Delete the freshly-invited auth user to keep state clean.
      await supabase.auth.admin.deleteUser(invite.user.id).catch(() => {});
      throw new Error("Liaison à l'espace de travail échouée : " + linkError.message);
    }

    return new Response(
      JSON.stringify({ id: invite.user.id, email: invite.user.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
