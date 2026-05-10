require('dotenv').config({ path: '../../../../.env' });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

const supabase = createClient(url, key);

async function run() {
  try {
    const { data, error } = await supabase
      .from('linked_wallets')
      .select('user_id')
      .eq('wallet_pubkey', 'NON_EXISTENT_WALLET')
      .single();
    
    console.log("Data:", data);
    console.log("Error:", error);
  } catch (e) {
    console.log("Exception:", e);
  }
}
run();
