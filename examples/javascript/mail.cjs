const { JustDeploy } = require('@justdeploy/sdk');

const justdeploy = new JustDeploy();

async function main() {
  const mail = await justdeploy.mail.send({
    from: 'hello@your-verified-domain.example',
    to: 'user@example.com',
    subject: 'Welcome',
    text: 'Thanks for joining.',
    idempotencyKey: 'replace-with-a-stable-unique-value',
  });
  console.log(mail.id, mail.status);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Mail request failed.');
  process.exitCode = 1;
});
