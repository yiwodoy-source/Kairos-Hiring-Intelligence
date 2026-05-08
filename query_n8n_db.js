
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function main() {
    const db = await open({
        filename: 'C:/Users/Admin/.n8n/database.sqlite',
        driver: sqlite3.Database
    });

    console.log('--- Workflows ---');
    const workflows = await db.all('SELECT id, name, active FROM workflow_entity');
    console.log(JSON.stringify(workflows, null, 2));

    console.log('\n--- Webhooks ---');
    const webhooks = await db.all('SELECT workflowId, path, method, webhookId FROM webhook_entity');
    console.log(JSON.stringify(webhooks, null, 2));

    await db.close();
}

main().catch(console.error);
