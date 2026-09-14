import { chromium } from 'playwright';

export interface ResumeData {
  name?: string | null | undefined;
  email?: string | null | undefined;
  phone?: string | null | undefined;
  location?: string | null | undefined;
  linkedin?: string | null | undefined;
  github?: string | null | undefined;
  portfolio?: string | null | undefined;
  summary?: string | null | undefined;
  skills?: string[] | undefined;
  experience?: Array<{
    title?: string;
    company?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    current?: boolean;
    highlights?: string[];
  }> | undefined;
  education?: Array<{
    institution?: string;
    degree?: string;
    fieldOfStudy?: string;
    graduationYear?: string | number;
    gpa?: string | number;
  }> | undefined;
  projects?: Array<{
    name?: string;
    technologies?: string[];
    description?: string;
    highlights?: string[];
    link?: string;
  }> | undefined;
  certifications?: Array<{
    name?: string;
    issuer?: string;
    year?: string | number;
  }> | undefined;
}

export class ResumePdfCompiler {
  /**
   * Generates a clean, single-page, ATS-optimized HTML string.
   */
  static generateHtml(data: ResumeData): string {
    const name = data.name || 'Candidate';
    const contactParts = [
      data.email,
      data.phone,
      data.location,
      data.linkedin ? `<a href="${data.linkedin}">LinkedIn</a>` : null,
      data.github ? `<a href="${data.github}">GitHub</a>` : null,
      data.portfolio ? `<a href="${data.portfolio}">Portfolio</a>` : null,
    ].filter(Boolean);

    const skillsSection = data.skills && data.skills.length > 0 ? `
      <div class="section">
        <h2>TECHNICAL SKILLS</h2>
        <p class="skills-list">${data.skills.join(' • ')}</p>
      </div>
    ` : '';

    const summarySection = data.summary ? `
      <div class="section">
        <h2>PROFESSIONAL SUMMARY</h2>
        <p class="summary">${data.summary}</p>
      </div>
    ` : '';

    const educationSection = data.education && data.education.length > 0 ? `
      <div class="section">
        <h2>EDUCATION</h2>
        ${data.education.map(edu => `
          <div class="entry">
            <div class="entry-header">
              <span class="title">${edu.institution || ''}</span>
              <span class="date">${edu.graduationYear || ''}</span>
            </div>
            <div class="subtitle">${edu.degree || ''} ${edu.fieldOfStudy ? `in ${edu.fieldOfStudy}` : ''} ${edu.gpa ? `(GPA: ${edu.gpa})` : ''}</div>
          </div>
        `).join('')}
      </div>
    ` : '';

    const projectsSection = data.projects && data.projects.length > 0 ? `
      <div class="section">
        <h2>PROJECTS</h2>
        ${data.projects.map(proj => `
          <div class="entry">
            <div class="entry-header">
              <span class="title">${proj.name || ''}</span>
              ${proj.technologies?.length ? `<span class="tech">[${proj.technologies.join(', ')}]</span>` : ''}
            </div>
            ${proj.description ? `<p class="desc">${proj.description}</p>` : ''}
            ${proj.highlights?.length ? `
              <ul>
                ${proj.highlights.map(h => `<li>${h}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    const experienceSection = data.experience && data.experience.length > 0 ? `
      <div class="section">
        <h2>EXPERIENCE & INTERNSHIPS</h2>
        ${data.experience.map(exp => `
          <div class="entry">
            <div class="entry-header">
              <span class="title">${exp.title || ''} – ${exp.company || ''}</span>
              <span class="date">${exp.startDate || ''} – ${exp.current ? 'Present' : exp.endDate || ''}</span>
            </div>
            ${exp.highlights?.length ? `
              <ul>
                ${exp.highlights.map(h => `<li>${h}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @page {
    size: A4;
    margin: 15mm 15mm 15mm 15mm;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #111827;
    background: #ffffff;
    margin: 0;
    padding: 0;
    font-size: 10pt;
    line-height: 1.35;
  }
  .header {
    text-align: center;
    border-bottom: 1.5pt solid #1e3a8a;
    padding-bottom: 6px;
    margin-bottom: 12px;
  }
  h1 {
    font-size: 18pt;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: #1e3a8a;
    letter-spacing: 0.5px;
  }
  .contact {
    font-size: 9pt;
    color: #4b5563;
  }
  .contact a {
    color: #1e3a8a;
    text-decoration: none;
  }
  .section {
    margin-bottom: 10px;
  }
  h2 {
    font-size: 11pt;
    font-weight: 700;
    color: #1e3a8a;
    border-bottom: 0.75pt solid #e5e7eb;
    padding-bottom: 2px;
    margin: 6px 0 4px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .skills-list {
    margin: 2px 0;
    font-size: 9.5pt;
    color: #1f2937;
  }
  .summary {
    margin: 2px 0;
    font-size: 9.5pt;
    color: #374151;
  }
  .entry {
    margin-bottom: 6px;
  }
  .entry-header {
    display: flex;
    justify-content: space-between;
    font-size: 10pt;
  }
  .title {
    font-weight: 600;
    color: #111827;
  }
  .date {
    font-size: 9pt;
    color: #4b5563;
  }
  .subtitle {
    font-size: 9pt;
    font-style: italic;
    color: #374151;
  }
  .tech {
    font-size: 8.5pt;
    color: #4b5563;
  }
  .desc {
    margin: 2px 0;
    font-size: 9pt;
  }
  ul {
    margin: 2px 0 4px 16px;
    padding: 0;
  }
  li {
    font-size: 9pt;
    margin-bottom: 1px;
    color: #374151;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${name}</h1>
    <div class="contact">${contactParts.join(' | ')}</div>
  </div>
  ${summarySection}
  ${skillsSection}
  ${educationSection}
  ${projectsSection}
  ${experienceSection}
</body>
</html>`;
  }

  /**
   * Compiles HTML into a PDF buffer via Playwright headless Chromium.
   */
  static async compilePdf(html: string): Promise<Buffer> {
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '12mm',
          bottom: '12mm',
          left: '12mm',
          right: '12mm',
        },
      });
      return pdfBuffer;
    } finally {
      await browser.close();
    }
  }
}
