import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// Test route to check server and database connection
router.get('/status', async (req, res) => {
  try {
    // Check database connection
    const { data, error } = await supabase
      .from('event_details')
      .select('created_at')
      .limit(1);

    if (error) throw error;

    res.json({
      status: 'ok',
      server: {
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        status: 'connected',
        timestamp: data?.[0]?.created_at || new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      server: {
        status: 'running',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      },
      database: {
        status: 'error',
        error: error.message
      }
    });
  }
});

export default router;