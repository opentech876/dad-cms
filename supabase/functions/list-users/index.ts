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

    // Workspace-scoped listing. The caller must either be owner of the target
    // workspace, or a platform-level system_admin (in which case they can
    // list any workspace's members).
    const body = await req.json().catch(() => ({}));
    const workspace_id = body?.workspace_id;
    if (!workspace_id || typeof workspace_id !== 'string') {
      throw new Error("L'identifiant de l'espace de travail est requis");
    }

    const [{ data: callerMembership }, { data: globalRole }] = await Promise.all([
      supabase.from('workspace_members')
        .select('role')
        .eq('workspace_id', workspace_id)
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle(),
    ]);

    const isWorkspaceOwner = callerMembership?.role === 'owner';
    const isSystemAdmin    = globalRole?.role === 'system_admin';
    if (!isWorkspaceOwner && !isSystemAdmin) {
      throw new Error("Accès refusé : rôle owner requis pour cet espace de travail");
    }

    // Fetch this workspace's members + the matching auth.users + profiles.
    const { data: members } = await supabase
      .from('workspace_members')
      .select('user_id, role, joined_at')
      .eq('workspace_id', workspace_id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify([]),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const memberIds = new Set(members.map((m: any) => m.user_id));

    const [authResult, profilesResult] = await Promise.all([
      supabase.auth.admin.listUsers({ perPage: 1000 }),
      supabase.from('profiles').select('user_id, full_name, phone, avatar_url').eq('workspace_id', workspace_id),
    ]);
    const authUsers = authResult.data?.users ?? [];
    const profiles  = profilesResult.data ?? [];

    const authMap    = new Map((authUsers as any[]).filter(u => memberIds.has(u.id)).map(u => [u.id, u]));
    const profileMap = new Map((profiles as any[]).map(p => [p.user_id, p]));

    // Crucially: do NOT filter out unconfirmed users. Pending invitations
    // surface here so the UI can render them in a dedicated "Invitations en
    // attente" section.
    const result = members.map((m: any) => {
      const u = authMap.get(m.user_id) as any;
      const profile = profileMap.get(m.user_id) as any;
      return {
        id: m.user_id,
        email: u?.email ?? null,
        full_name: profile?.full_name ?? null,
        phone: profile?.phone ?? null,
        avatar_url: profile?.avatar_url ?? null,
        role: m.role,
        // null = pending invitation (user invited but hasn't accepted yet).
        email_confirmed_at: u?.email_confirmed_at ?? null,
        invited_at: m.joined_at,
        banned: u?.banned_until ? new Date(u.banned_until) > new Date() : false,
        created_at: u?.created_at ?? null,
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
