import { logAgentActivity } from './logger';
const pdf = require('pdf-parse');

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
    try {
        if (!buffer || buffer.length === 0) {
            throw new Error('PDF buffer is empty');
        }

        // Validate buffer size (max 10MB)
        if (buffer.length > 10 * 1024 * 1024) {
            throw new Error('PDF file too large (max 10MB)');
        }

        const data = await pdf(buffer);
        
        if (!data || !data.text) {
            throw new Error('PDF extraction returned no text');
        }

        const text = data.text.trim();
        
        if (text.length === 0) {
            throw new Error('PDF contains no extractable text');
        }

        // Limit text length to prevent AI token overflow
        return text.substring(0, 50000);
    } catch (error: any) {
        logAgentActivity(`PDF Parser Error: ${error.message}`, 'ERROR');
        throw new Error(`Failed to extract text from PDF: ${error.message}`);
    }
}