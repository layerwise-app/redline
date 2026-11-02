import { z } from 'zod';
import { redline } from '~/redline.config';
import { isHexColor } from '~/lib/redline/color';

// Control characters are stripped everywhere; line breaks only survive in comment
// and report bodies. That keeps names safe for email subject lines.
// eslint-disable-next-line no-control-regex
const stripControls = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
const oneLine = (value: string) =>
  stripControls(value).replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

const line = (label: string, max: number) =>
  z
    .string()
    .transform(oneLine)
    .refine((v) => v.length > 0, `${label} is required.`)
    .refine((v) => v.length <= max, `${label} must be ${max} characters or fewer.`);

export const id = z.string().min(1).max(64);
export const token = z.string().min(16).max(64).regex(/^[\w-]+$/);

export const commentBody = z
  .string()
  .transform((v) => stripControls(v).trim())
  .refine((v) => v.length > 0, 'Write something first.')
  .refine(
    (v) => v.length <= redline.limits.commentMaxLength,
    `Comments can be up to ${redline.limits.commentMaxLength} characters.`
  );

export const reviewName = line('Review name', redline.limits.reviewNameMaxLength);
export const clientName = line('Client name', redline.limits.clientNameMaxLength);
export const assetName = line('File name', 200);
export const workspaceName = line(
  'Workspace name',
  redline.limits.workspaceNameMaxLength
);
export const guestName = line('Name', redline.limits.guestNameMaxLength);

export const email = z
  .string()
  .transform((v) => oneLine(v).toLowerCase())
  .refine(
    (v) => v.length <= 254 && z.email().safeParse(v).success,
    'Enter a valid email address.'
  );

export const accentColor = z
  .string()
  .refine(isHexColor, 'Choose a color as a six-digit hex value, like #D92D20.');

export const coordinate = z.number().finite().min(0).max(1);
export const pageNumber = z.number().int().min(1).max(redline.limits.maxPdfPages);

export const reportReason = z.enum([
  'spam',
  'abuse',
  'copyright',
  'malware',
  'other'
]);

export const reportDetails = z
  .string()
  .transform((v) => stripControls(v).trim())
  .refine(
    (v) => v.length <= redline.limits.reportMaxLength,
    `Keep this under ${redline.limits.reportMaxLength} characters.`
  );

export const linkPassword = z
  .string()
  .min(4, 'Use at least 4 characters.')
  .max(128, 'Use at most 128 characters.');

/** Run a schema and surface its first message as a readable error. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  throw new Error(issue?.message && issue.code === 'custom' ? issue.message : 'That input isn’t valid.');
}
