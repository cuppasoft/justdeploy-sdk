import { JustDeploy } from '@justdeploy/sdk';

const justdeploy = new JustDeploy();
await justdeploy.databases.query('your-database-id', 'SELECT * FROM orders');
console.log('query completed');
