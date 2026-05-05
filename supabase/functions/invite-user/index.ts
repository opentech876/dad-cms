import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_ROLES = ['owner', 'chef_equipe', 'editeur', 'charge_communication'];

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

    if (!roleData || !['owner', 'chef_equipe'].includes(roleData.role)) {
      throw new Error('Accès refusé : rôle owner ou chef_equipe requis');
    }
    if (roleData.expires_at && new Date(roleData.expires_at) < new Date()) {
      throw new Error('Session expirée — reconnectez-vous');
    }

    const { email, role, redirectTo } = await req.json();

    if (!email?.trim()) throw new Error("L'adresse e-mail est requise");
    if (!role || !VALID_ROLES.includes(role)) throw new Error('Rôle invalide');

    const { data, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: { role },
        ...(redirectTo ? { redirectTo } : {}),
      },
    );

    if (inviteError) throw inviteError;

    return new Response(
      JSON.stringify({ id: data.user.id, email: data.user.email }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
