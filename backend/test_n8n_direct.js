import axios from 'axios';

const webhookUrl = 'http://localhost:3001/api/n8n/trigger';

async function testTrigger() {
    console.log(`Triggering n8n at: ${webhookUrl}`);
    try {
        const response = await axios.post(webhookUrl, {
            event: 'cv_processing_trigger',
            data: {
                test: true,
                source: 'diagnostic_script'
            }
        });
        console.log('Response from n8n:', response.data);
    } catch (error) {
        console.error('Error triggering n8n:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testTrigger();
