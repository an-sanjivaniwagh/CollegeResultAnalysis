import { Component, signal } from '@angular/core';
import * as XLSX from 'xlsx';
import { getDocument } from 'pdfjs-dist';

interface Subject {
  code: string;
  name: string;
}

interface StudentResult {
  prn: string;
  name: string;
  marks: Record<string, number>;
}

interface ParsedReport {
  subjects: Subject[];
  results: StudentResult[];
}

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly selectedFile = signal<File | null>(null);
  protected readonly isProcessing = signal(false);
  protected readonly isDragging = signal(false);
  protected readonly toast = signal('');
  private readonly extractedReport = signal<ParsedReport | null>(null);

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.setFile(file);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) this.setFile(file);
  }

  protected async processFile(): Promise<void> {
    const file = this.selectedFile();
    if (!file) return;
    this.isProcessing.set(true);
    try {
      const text = await this.extractPdfText(file);
      const report = this.parseReport(text);
      if (!report.subjects.length || !report.results.length) {
        throw new Error('No student records found');
      }
      this.extractedReport.set(report);
      this.showToast(`${report.results.length} records and ${report.subjects.length} subjects extracted`);
    } catch {
      this.extractedReport.set(null);
      this.showToast('Could not read student records from this PDF');
    } finally {
      this.isProcessing.set(false);
    }
  }

  protected downloadReport(): void {
    const report = this.extractedReport();
    if (!report) {
      this.showToast('Generate an analysis before downloading');
      return;
    }
    const subjectHeaders = report.subjects.map((subject) => `${subject.code} - ${subject.name}`);
    const firstSubjectColumn = 2;
    const lastSubjectColumn = firstSubjectColumn + report.subjects.length - 1;
    const totalColumn = lastSubjectColumn + 1;
    const percentageColumn = totalColumn + 1;
    const totalColumnLetter = this.columnLetter(totalColumn);
    const firstSubjectColumnLetter = this.columnLetter(firstSubjectColumn);
    const lastSubjectColumnLetter = this.columnLetter(lastSubjectColumn);
    const percentageColumnLetter = this.columnLetter(percentageColumn);
    const rows: (string | number)[][] = [
      ['PRN', 'Name', ...subjectHeaders, 'Total', 'Percentage', 'Grade', 'GP', 'CP', 'Result'],
      ...report.results.map((result, index) => {
        const row = index + 2;
        return [
          result.prn,
          result.name,
          ...report.subjects.map((subject) => result.marks[subject.code]),
          `=SUM(${firstSubjectColumnLetter}${row}:${lastSubjectColumnLetter}${row})`,
          `=${totalColumnLetter}${row}/${report.subjects.length * 100}*100`,
          `=IF(${percentageColumnLetter}${row}>=75,"A",IF(${percentageColumnLetter}${row}>=60,"B",IF(${percentageColumnLetter}${row}>=50,"C",IF(${percentageColumnLetter}${row}>=40,"D","F"))))`,
          `=IF(${this.columnLetter(percentageColumn + 1)}${row}="A",10,IF(${this.columnLetter(percentageColumn + 1)}${row}="B",8,IF(${this.columnLetter(percentageColumn + 1)}${row}="C",6,IF(${this.columnLetter(percentageColumn + 1)}${row}="D",4,0))))`,
          `=${this.columnLetter(percentageColumn + 2)}${row}*3`,
          `=IF(${percentageColumnLetter}${row}>=40,"PASS","FAIL")`,
        ];
      }),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Results');
    const workbookData = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([workbookData], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'result-forge-analysis.xlsx';
    anchor.click();
    URL.revokeObjectURL(url);
    this.showToast('Analysis workbook downloaded');
  }

  private async extractPdfText(file: File): Promise<string> {
    const pdf = await getDocument({ data: await file.arrayBuffer() }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages.join('\n');
  }

  private parseReport(text: string): ParsedReport {
    const firstRecordIndex = text.search(/\b[A-Z]{1,6}[-/]\d{4,}\b/);
    const subjects = this.parseSubjects(firstRecordIndex >= 0 ? text.slice(0, firstRecordIndex) : text);
    const results: StudentResult[] = [];
    if (!subjects.length) return { subjects, results };

    const marksPattern = `(\\d{1,3}\\s+){${subjects.length - 1}}\\d{1,3}`;
    const recordPattern = new RegExp(`\\b([A-Z]{1,6}[-/]\\d{4,})\\b\\s+([A-Za-z][A-Za-z .'-]*?)\\s+(${marksPattern})(?=\\s|$)`, 'g');
    let match: RegExpExecArray | null;
    while ((match = recordPattern.exec(text)) !== null) {
      const marks = match[3].trim().split(/\s+/).map(Number);
      if (marks.every((mark) => mark >= 0 && mark <= 100)) {
        const subjectMarks = Object.fromEntries(subjects.map((subject, index) => [subject.code, marks[index]]));
        results.push({
          prn: match[1],
          name: match[2].trim(),
          marks: subjectMarks,
        });
      }
    }
    return { subjects, results };
  }

  private parseSubjects(header: string): Subject[] {
    const subjects: Subject[] = [];
    const seenCodes = new Set<string>();
    const codePattern = /\b([A-Z]{0,6}[-\/]?\d{2,}[A-Z0-9]*)\b\s+([A-Za-z][A-Za-z &()/'-]*?)(?=\s+\b[A-Z]{0,6}[-\/]?\d{2,}[A-Z0-9]*\b|\s+(?:PRN|Name|Marks?|Total|Percentage|Grade|Result)\b|$)/gi;
    let match: RegExpExecArray | null;
    while ((match = codePattern.exec(header)) !== null) {
      const code = match[1].toUpperCase();
      if (!seenCodes.has(code)) {
        subjects.push({ code, name: match[2].trim() });
        seenCodes.add(code);
      }
    }

    const nameCodePattern = /\b([A-Za-z][A-Za-z &/'-]{2,}?)\s*\(([A-Z]{0,6}[-\/]?\d{2,}[A-Z0-9]*)\)/gi;
    while ((match = nameCodePattern.exec(header)) !== null) {
      const code = match[2].toUpperCase();
      if (!seenCodes.has(code)) {
        subjects.push({ code, name: match[1].trim() });
        seenCodes.add(code);
      }
    }
    return subjects;
  }

  private columnLetter(columnIndex: number): string {
    let column = columnIndex + 1;
    let letter = '';
    while (column > 0) {
      const remainder = (column - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      column = Math.floor((column - 1) / 26);
    }
    return letter;
  }

  private setFile(file: File): void {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      this.showToast('Please choose a PDF result summary');
      return;
    }
    this.selectedFile.set(file);
  }

  private showToast(message: string): void {
    this.toast.set(message);
    window.setTimeout(() => this.toast.set(''), 3200);
  }
}
