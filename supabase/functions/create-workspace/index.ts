import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
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

    const {
      data: { user },
    } = await supabase.auth.getUser(token);
    if (!user) throw new Error('Token invalide');

    const { name } = await req.json();
    if (!name?.trim()) throw new Error('Le nom du workspace est requis');

    // Appel au RPC (tout est atomique)
    const { data: workspace, error } = await supabase.rpc('finalize_workspace_creation', {
      p_name: name.trim(),
      p_user_id: user.id,
    });

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        workspace,
        message: 'Workspace créé avec succès',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('create-workspace error:', err);
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
