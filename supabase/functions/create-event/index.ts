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

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) throw new Error('Token invalide');

    const { calendar_id, event_date, historical_year, position, title, description, image_path } =
      await req.json();

    if (!calendar_id?.trim()) throw new Error('calendar_id est requis');
    if (!event_date?.trim()) throw new Error('event_date est requis');
    if (!title?.trim()) throw new Error('Le titre est requis');
    if (position !== 1 && position !== 2) throw new Error('position doit être 1 ou 2');
    if (!historical_year || !Number.isInteger(historical_year)) {
      throw new Error('historical_year doit être un entier');
    }

    const { data, error } = await supabase
      .from('events')
      .insert({
        calendar_id,
        event_date,
        historical_year,
        position,
        title: title.trim(),
        description: description?.trim() || null,
        image_path: image_path || null,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (error) {
      // Surface unique constraint violation as a readable message
      if (error.code === '23505') {
        throw new Error(`La position ${position} est déjà occupée pour le ${event_date}`);
      }
      throw error;
    }

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('create-event error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
