import { redline } from '~/redline.config';

export type RenderedEmail = { subject: string; html: string; text: string };

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

type Block =
  | { p: string }
  | { quote: string; by?: string }
  | { list: string[] }
  | { note: string };

function render(
  subject: string,
  blocks: Block[],
  action: { label: string; url: string }
): RenderedEmail {
  const { ink, inkMuted, line, paper } = redline.colors;
  const font = `-apple-system, 'Helvetica Neue', Arial, sans-serif`;
  const body = blocks
    .map((block) => {
      if ('p' in block) {
        return `<p style="margin:0 0 16px;font:15px/1.5 ${font};color:${ink}">${escapeHtml(block.p)}</p>`;
      }
      if ('note' in block) {
        return `<p style="margin:0 0 16px;font:13px/1.5 ${font};color:${inkMuted}">${escapeHtml(block.note)}</p>`;
      }
      if ('list' in block) {
        const items = block.list
          .map((item) => `<li style="margin:0 0 8px">${escapeHtml(item)}</li>`)
          .join('');
        return `<ul style="margin:0 0 16px;padding-left:18px;font:15px/1.5 ${font};color:${ink}">${items}</ul>`;
      }
      const by = block.by
        ? `<div style="margin-bottom:4px;font:13px/1.5 ${font};color:${inkMuted}">${escapeHtml(block.by)}</div>`
        : '';
      return `<blockquote style="margin:0 0 16px;padding:0 0 0 12px;border-left:2px solid ${line};font:15px/1.5 ${font};color:${ink};white-space:pre-wrap">${by}${escapeHtml(block.quote)}</blockquote>`;
    })
    .join('');
  const html = `<div style="background:${paper};padding:24px"><div style="max-width:520px;margin:0 auto">${body}<p style="margin:24px 0 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:10px 16px;background:${ink};color:#ffffff;text-decoration:none;font:600 14px/1 ${font};border-radius:4px">${escapeHtml(action.label)}</a></p><p style="margin:16px 0 0;font:13px/1.5 ${font};color:${inkMuted};word-break:break-all">${escapeHtml(action.url)}</p></div></div>`;
  const text = [
    ...blocks.map((block) => {
      if ('p' in block) return block.p;
      if ('note' in block) return block.note;
      if ('list' in block) return block.list.map((item) => `- ${item}`).join('\n');
      return `${block.by ? `${block.by}\n` : ''}> ${block.quote.replace(/\n/g, '\n> ')}`;
    }),
    `${action.label}: ${action.url}`
  ].join('\n\n');
  return { subject: oneLine(subject).slice(0, 998), html, text };
}

/** Fixed wording: only the workspace and review names are filled in. */
export function shareEmail(i: {
  workspace: string;
  review: string;
  url: string;
}) {
  return render(
    `${i.workspace} shared “${i.review}” for your review`,
    [
      {
        p: `${i.workspace} shared “${i.review}” with you. Open the link to see the designs, drop comments on them, and approve or request changes. You don’t need an account.`
      }
    ],
    { label: 'Open the review', url: i.url }
  );
}

export function replyEmail(i: {
  workspace: string;
  review: string;
  author: string;
  body: string;
  url: string;
}) {
  return render(
    `${i.workspace} replied on “${i.review}”`,
    [
      { p: `${i.author} replied to your comment on “${i.review}”.` },
      { quote: i.body },
      { note: 'You’re getting this because you asked to be emailed when the team replies.' }
    ],
    { label: 'See the conversation', url: i.url }
  );
}

export function newVersionEmail(i: {
  workspace: string;
  review: string;
  asset: string;
  versionNumber: number;
  url: string;
}) {
  return render(
    `New version of ${i.asset} on “${i.review}”`,
    [
      {
        p: `${i.workspace} uploaded version ${i.versionNumber} of ${i.asset} on “${i.review}”. It’s ready for you to review.`
      }
    ],
    { label: 'Review the new version', url: i.url }
  );
}

export function feedbackEmail(i: {
  guest: string;
  review: string;
  items: string[];
  more: number;
  url: string;
}) {
  const count = i.items.length + i.more;
  return render(
    `${i.guest} sent feedback on “${i.review}”`,
    [
      {
        p: `${i.guest} finished a round of feedback on “${i.review}”, with ${count} ${count === 1 ? 'comment' : 'comments'}.`
      },
      ...(i.items.length ? [{ list: i.items }] : []),
      ...(i.more ? [{ note: `And ${i.more} more in the review.` }] : []),
      { note: 'The name is as the guest entered it.' }
    ],
    { label: 'Open the review', url: i.url }
  );
}

export function decisionEmail(i: {
  guest: string;
  review: string;
  asset: string;
  versionNumber: number;
  decision: 'approved' | 'changes_requested';
  url: string;
}) {
  const verb = i.decision === 'approved' ? 'approved' : 'requested changes on';
  return render(
    `${i.guest} ${verb} ${i.asset} (V${i.versionNumber})`,
    [
      {
        p: `${i.guest} ${verb} ${i.asset}, version ${i.versionNumber}, on “${i.review}”.`
      },
      { note: 'The name is as the guest entered it.' }
    ],
    { label: 'Open the review', url: i.url }
  );
}

export function firstCommentEmail(i: {
  guest: string;
  review: string;
  body: string;
  url: string;
}) {
  return render(
    `${i.guest} commented on “${i.review}”`,
    [
      { p: `${i.guest} left their first comment on “${i.review}”.` },
      { quote: i.body },
      { note: 'The name is as the guest entered it.' }
    ],
    { label: 'Open the review', url: i.url }
  );
}

export function inviteEmail(i: {
  inviter: string;
  workspace: string;
  url: string;
}) {
  return render(
    `${i.inviter} invited you to ${i.workspace} on ${redline.product.name}`,
    [
      {
        p: `${i.inviter} invited you to join ${i.workspace} on ${redline.product.name}, where the team reviews designs with clients. This invitation works once and expires in 7 days.`
      }
    ],
    { label: 'Accept the invitation', url: i.url }
  );
}
