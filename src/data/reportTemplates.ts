import type { ViolationCategory, FiledReport } from '../types/vrchat';

export interface ViolationCategoryDef {
  label: string;
  emoji: string;
  description: string;
  playerOnly?: boolean;
  groupOnly?: boolean;
  subtypes?: string[];
  subtypeLabel?: string;
  subtypeAllowCustom?: boolean;
  urgency?: 'normal' | 'urgent';
}

export const VIOLATION_CATEGORIES: Record<ViolationCategory, ViolationCategoryDef> = {
  harassment: {
    label: 'Harassment / Bullying',
    emoji: '🚫',
    description: 'Targeted, repeated hostile behaviour toward a specific person',
    subtypes: ['One-time incident', 'Ongoing / repeated pattern'],
    subtypeLabel: 'Is this ongoing or a one-time incident?',
  },
  hate_speech: {
    label: 'Hate Speech / Discrimination',
    emoji: '⚠️',
    description: 'Slurs, derogatory language, or content targeting a protected group',
    subtypes: ['Race / ethnicity', 'Gender / sexuality', 'Religion', 'Disability', 'Other'],
    subtypeLabel: 'What protected characteristic was targeted?',
    subtypeAllowCustom: true,
  },
  nsfw_content: {
    label: 'Sexual / NSFW Content',
    emoji: '🔞',
    description: 'Explicit avatar, behaviour, or content in a public or general-audience space',
    subtypes: ['Explicit avatar', 'Sexual behaviour in public instance', 'Sharing explicit media', 'All of the above'],
    subtypeLabel: 'What type of NSFW content?',
  },
  cheating: {
    label: 'Cheating / Exploits',
    emoji: '🛠️',
    description: 'Speed hacking, fly hacking, crashing instances, or abusing game exploits',
    subtypes: ['Speed / fly hacking', 'Instance crashing', 'Lag / network abuse', 'Avatar crashing', 'Other'],
    subtypeLabel: 'What type of cheating?',
    subtypeAllowCustom: true,
  },
  impersonation: {
    label: 'Impersonation',
    emoji: '🎭',
    description: 'Pretending to be another player, content creator, or VRChat staff',
    subtypes: ['Impersonating me', 'Impersonating another specific person', 'Impersonating VRChat staff / team'],
    subtypeLabel: 'Who are they impersonating?',
    subtypeAllowCustom: true,
  },
  spam: {
    label: 'Spam / Advertising',
    emoji: '📢',
    description: 'Unsolicited promotion, invite spam, or repetitive disruptive messaging',
  },
  self_harm: {
    label: 'Self-Harm / Crisis Content',
    emoji: '🆘',
    description: 'Content referencing suicide, self-harm, or signs of a real-world crisis',
    urgency: 'urgent',
  },
  doxxing: {
    label: 'Doxxing / Privacy Violation',
    emoji: '🔍',
    description: "Sharing someone's real personal information without consent",
    subtypes: ['Real name', 'Location / address', 'Contact info', 'Photos / identity', 'Multiple types'],
    subtypeLabel: 'What type of personal information was shared?',
    subtypeAllowCustom: true,
  },
  group_misuse: {
    label: 'Group Misuse',
    emoji: '🏛️',
    description: 'Misleading group description, abusive moderation, or group rule violations',
    groupOnly: true,
    subtypes: ['Misleading group description', 'Abusive moderation by group staff', 'Group rules not enforced', 'Other'],
    subtypeLabel: 'What kind of group misuse?',
    subtypeAllowCustom: true,
  },
  group_harassment: {
    label: 'Coordinated Group Harassment',
    emoji: '👥',
    description: 'A group or its members organising targeted harassment against individuals',
    groupOnly: true,
  },
};

export const PLAYER_CATEGORIES = (Object.keys(VIOLATION_CATEGORIES) as ViolationCategory[])
  .filter(k => !VIOLATION_CATEGORIES[k].groupOnly);

export const GROUP_CATEGORIES = (Object.keys(VIOLATION_CATEGORIES) as ViolationCategory[])
  .filter(k => !VIOLATION_CATEGORIES[k].playerOnly);

function fmt(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  });
}

export function generateReportText(report: Partial<FiledReport>): string {
  const {
    reportType = 'player',
    targetName = '[unknown]',
    targetId = '',
    violationCategory,
    violationSubtype,
    hasEvidence = false,
    evidenceType,
    worldName,
    instanceId,
    incidentTime = Date.now(),
    witnesses,
  } = report;

  const catDef = violationCategory ? VIOLATION_CATEGORIES[violationCategory] : null;
  const isUrgent = catDef?.urgency === 'urgent';

  const when = fmt(incidentTime);
  const where = worldName
    ? `the world "${worldName}"${instanceId ? ` (instance ${instanceId})` : ''}`
    : 'an instance I was in';

  const evidenceLine = hasEvidence
    ? `I have ${evidenceType === 'both' ? 'screenshots and video' : evidenceType === 'video' ? 'video footage' : 'screenshots'} I can provide if helpful.`
    : '';

  const witnessLine = witnesses?.trim()
    ? `Others who were there at the time: ${witnesses.trim()}.`
    : '';

  const extras = [evidenceLine, witnessLine].filter(Boolean).join('\n');

  const subNote = violationSubtype ? ` (${violationSubtype})` : '';
  const id = targetId ? ` (user ID: ${targetId})` : '';
  const gid = targetId ? ` (group ID: ${targetId})` : '';

  let body = '';

  switch (violationCategory) {
    case 'harassment':
      body = `I'd like to report ${targetName}${id} for harassment${subNote}.

This happened on ${when} in ${where}.${violationSubtype === 'Ongoing / repeated pattern'
  ? '\n\nThis has been an ongoing pattern — it\'s not a one-off incident, this person has targeted me multiple times.'
  : ''}
${extras ? '\n' + extras : ''}
It made the space feel unsafe and I'd appreciate this being looked into.`;
      break;

    case 'hate_speech':
      body = `I want to report ${targetName}${id} for using hate speech${subNote ? ` targeting ${violationSubtype}` : ''}.

This happened on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
This kind of language has no place in VRChat and I'd like to see it addressed.`;
      break;

    case 'nsfw_content':
      body = `I'm reporting ${targetName}${id} for NSFW content in a public/general instance${subNote}.

This occurred on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
The content was inappropriate for a shared social space.`;
      break;

    case 'cheating':
      body = `I want to report ${targetName}${id} for cheating${subNote}.

This happened on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
The behaviour disrupted the instance for everyone present.`;
      break;

    case 'impersonation':
      body = `I'm reporting ${targetName}${id} for impersonation${subNote}.

This happened on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
The impersonation was misleading and I'd like this account reviewed.`;
      break;

    case 'spam':
      body = `I want to report ${targetName}${id} for sending spam or unsolicited advertising.

This happened on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
The behaviour was disruptive and repetitive.`;
      break;

    case 'self_harm':
      body = `URGENT — I need to report content related to self-harm or a potential real crisis involving ${targetName}${id}.

This occurred on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
I'm genuinely concerned for the person involved and wanted to flag this as quickly as possible. Please treat this as a priority.`;
      break;

    case 'doxxing':
      body = `I'm reporting ${targetName}${id} for sharing someone's personal information without their consent${subNote}.

This happened on ${when} in ${where}.
${extras ? '\n' + extras + '\n' : ''}
This is a serious privacy violation and I'd like the content reviewed and removed.`;
      break;

    case 'group_misuse':
      body = `I want to report the group "${targetName}"${gid} for misuse of group features${subNote}.

I noticed this on ${when}.
${extras ? '\n' + extras + '\n' : ''}
I'd like this group reviewed to make sure it's operating within VRChat's community guidelines.`;
      break;

    case 'group_harassment':
      body = `I'm reporting the group "${targetName}"${gid} for organising or enabling coordinated harassment.

This was active as of ${when}.
${extras ? '\n' + extras + '\n' : ''}
Coordinated harassment is a serious issue and I'd like this group looked into urgently.`;
      break;

    default:
      body = `I want to report ${targetName}${targetId ? ` (ID: ${targetId})` : ''} for a community guidelines violation.

This happened on ${when}${worldName ? ` in "${worldName}"` : ''}.
${extras ? '\n' + extras + '\n' : ''}
I'd appreciate this being reviewed.`;
  }

  const urgentSubject = isUrgent ? 'URGENT — ' : '';

  return `Subject: ${urgentSubject}${catDef?.label || 'Violation'} – ${targetName}

${body.trim()}

Thanks for your time.`;
}
