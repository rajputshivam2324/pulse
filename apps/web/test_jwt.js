const jose = require('jose');
async function run() {
  const secret = new TextEncoder().encode("change-me-to-a-long-random-string-in-production");
  const token = await new jose.SignJWT({ wallet: 'test_wallet_address' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('test_wallet_address')
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
    
  console.log("Token:", token);

  const res = await fetch('http://localhost:3000/api/programs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      wallet: 'test_wallet_address',
      programAddress: 'test_program_address'
    })
  });
  
  console.log("Status:", res.status);
  const text = await res.text();
  console.log("Response:", text);
}
run();
