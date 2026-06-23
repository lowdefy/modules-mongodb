import { humanizeSlug, BASE_ACRONYMS } from './humanizeSlug.js';

describe('humanizeSlug', () => {
  describe('splitting', () => {
    it('splits on hyphens', () => {
      expect(humanizeSlug('send-quote')).toBe('Send Quote');
    });

    it('splits on underscores', () => {
      expect(humanizeSlug('company_setup')).toBe('Company Setup');
    });

    it('splits on camelCase boundaries', () => {
      expect(humanizeSlug('kickoffCall')).toBe('Kickoff Call');
    });

    it('handles multi-word slugs', () => {
      expect(humanizeSlug('assign-account-manager')).toBe(
        'Assign Account Manager',
      );
    });

    it('title-cases a single token', () => {
      expect(humanizeSlug('qualify')).toBe('Qualify');
    });
  });

  describe('minor words', () => {
    it('lowercases a minor word in the middle', () => {
      expect(humanizeSlug('convert-to-customer')).toBe('Convert to Customer');
    });

    it('keeps a minor word capitalized as the first token', () => {
      expect(humanizeSlug('to-do')).toBe('To Do');
    });

    it('keeps a minor word capitalized as the last token', () => {
      expect(humanizeSlug('opt-in')).toBe('Opt In');
    });
  });

  describe('acronyms', () => {
    it('uppercases a base-set acronym', () => {
      expect(humanizeSlug('upload-po')).toBe('Upload PO');
    });

    it('uppercases a base-set acronym anywhere in the slug', () => {
      expect(humanizeSlug('po-number')).toBe('PO Number');
    });

    it('merges app-supplied acronyms with the base set', () => {
      expect(humanizeSlug('bom', ['BOM'])).toBe('BOM');
      expect(humanizeSlug('upload-bom', ['BOM'])).toBe('Upload BOM');
    });

    it('merges app-supplied acronyms case-insensitively', () => {
      expect(humanizeSlug('sku-list', ['sku'])).toBe('SKU List');
    });

    it('still applies the base set when app acronyms are supplied', () => {
      expect(humanizeSlug('upload-po', ['BOM'])).toBe('Upload PO');
    });

    it('takes precedence over minor-word lowercasing', () => {
      // "in" is a minor word but if an app declares it an acronym it uppercases.
      expect(humanizeSlug('opt-in-flow', ['IN'])).toBe('Opt IN Flow');
    });
  });

  describe('exports', () => {
    it('ships the documented base acronym set', () => {
      expect(BASE_ACRONYMS).toEqual([
        'PO',
        'ID',
        'URL',
        'API',
        'CRM',
        'SLA',
        'KPI',
        'VAT',
        'PDF',
        'CSV',
        'FAQ',
        'KYC',
        'RFQ',
      ]);
    });
  });
});
