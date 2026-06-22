import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = ['owner', 'chef_equipe', 'editeur', 'charge_communication', 'presidence', 'chef_equipe_commerciale'];
const VALID_ACTIONS = ['update_role', 'block', 'unblock', 'remove', 'set_password'];

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

    if (!roleData || roleData.role !== 'owner') {
      throw new Error('Accès refusé : rôle owner requis');
    }
    if (roleData.expires_at && new Date(roleData.expires_at) < new Date()) {
      throw new Error('Session expirée — reconnectez-vous');
    }

    const { userId, action, role, password } = await req.json();

    if (!userId) throw new Error("L'identifiant utilisateur est requis");
    if (!action || !VALID_ACTIONS.includes(action)) throw new Error('Action invalide');
    if (userId === user.id) throw new Error('Vous ne pouvez pas modifier votre propre compte');

    switch (action) {
      case 'update_role': {
        if (!role || !VALID_ROLES.includes(role)) throw new Error('Rôle invalide');
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
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
        const { error } = await supabase.auth.admin.deleteUser(userId);
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
