import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Get all active events
router.get('/active', async (req, res) => {
  try {
    const currentDate = new Date().toISOString();
    const { data, error } = await supabase
      .from('event_details')
      .select('*')
      .gt('event_enddate', currentDate)
      .eq('is_approved', true)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get past events
router.get('/past', async (req, res) => {
  try {
    const currentDate = new Date().toISOString();
    const { data, error } = await supabase
      .from('event_details')
      .select('*')
      .lt('event_enddate', currentDate)
      .eq('is_approved', true)
      .order('event_enddate', { ascending: false })
      .limit(5);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search events by location
router.get('/location/:location', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_details')
      .select('*')
      .ilike('event_location', `%${req.params.location}%`)
      .eq('is_approved', true);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search events by category
router.get('/category/:category', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_details')
      .select('*')
      .ilike('event_category', `%${req.params.category}%`)
      .eq('is_approved', true);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get popular events
router.get('/popular', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('event_details')
      .select('*')
      .eq('is_approved', true)
      .order('event_likes', { ascending: false })
      .limit(5);

    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;