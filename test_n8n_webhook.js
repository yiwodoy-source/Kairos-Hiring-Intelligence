import axios from 'axios';

const webhookUrl = 'http://localhost:5678/webhook/70885cc8-c815-4b5a-b98a-3ba9c4bdf300';

console.log('Testing n8n webhook connection...');
console.log('Webhook URL:', webhookUrl);

try {
    const response = await axios.post(webhookUrl, {
        event: 'test_from_script',
        data: {
            test: true,
            timestamp: new Date().toISOString()
        }
    }, {
        headers: {
            'Content-Type': 'application/json'
        }
    });

    console.log('✅ SUCCESS! Webhook responded:');
    console.log('Status:', response.status);
    console.log('Data:', JSON.stringify(response.data, null, 2));
    console.log('\n🎉 n8n webhook is working! Check n8n Executions tab.');
} catch (error) {
    console.log('❌ ERROR! Webhook failed:');
    if (error.response) {
        console.log('Status:', error.response.status);
        console.log('Error:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
        console.log('No response received. Is n8n running on port 5678?');
    } else {
        console.log('Error:', error.message);
    }
}
