import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const [
      { data: { users: authUsers } },
      { data: profiles },
      { data: roles },
    ] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from('profiles').select('user_id, full_name, phone, avatar_url'),
      supabase.from('user_roles').select('user_id, role, expires_at'),
    ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    const roleMap = new Map((roles ?? []).map((r) => [r.user_id, r]));

    const result = (authUsers ?? [])
      .filter((u) => !!u.email_confirmed_at)
      .map((u) => {
      const profile = profileMap.get(u.id);
      const role = roleMap.get(u.id);
      return {
        id: u.id,
        email: u.email ?? null,
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: role?.role ?? null,
        expires_at: role?.expires_at ?? null,
        banned: u.banned_until ? new Date(u.banned_until) > new Date() : false,
        created_at: u.created_at,
      };
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
