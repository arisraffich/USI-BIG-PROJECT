// Separate file for PDF parsing to avoid import issues
export async function parsePdf(buffer: Buffer): Promise<string> {
  // Use pdf-parse v1.1.1
  // The test file has been created to prevent initialization errors
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  
  // pdf-parse v1.1.1 exports the function directly
  const pdfData = await pdfParse(buffer)
  
  // Return the text content
  return pdfData.text || ''
}

