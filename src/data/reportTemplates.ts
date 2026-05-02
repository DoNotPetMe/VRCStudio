import type { ViolationCategory, FiledReport } from '../types/vrchat';

export interface ViolationCategoryDef {
  label: string;
  emoji: string;
  description: string;
  playerOnly?: boolean;
  groupOnly?: boolean;
  subtypes?: string[];
  subtypeLabel?: string;
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
    subtypes: ['Speed / fly hacking', 'Instance crashing', 'Lag / network abuse', 'Avatar crashing', 'Other exploit'],
    subtypeLabel: 'What type of cheating?',
  },
  impersonation: {
    label: 'Impersonation',
    emoji: '🎭',
    description: 'Pretending to be another player, content creator, or VRChat staff',
    subtypes: ['Impersonating me', 'Impersonating another specific person', 'Impersonating VRChat staff / team'],
    subtypeLabel: 'Who are they impersonating?',
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
    description: 'Sharing someone\'s real personal information without consent',
    subtypes: ['Real name', 'Location / address', 'Contact info', 'Photos / identity', 'Multiple types'],
    subtypeLabel: 'What type of personal information was shared?',
  },
  group_misuse: {
    label: 'Group Misuse',
    emoji: '🏛️',
    description: 'Misleading group description, abusive moderation, or group rule violations',
    groupOnly: true,
    subtypes: ['Misleading group description', 'Abusive moderation by group staff', 'Group rules not enforced', 'Other'],
    subtypeLabel: 'What kind of group misuse?',
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

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'long', year: 'numeric',
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', {
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
    worldId,
    instanceId,
    incidentTime = Date.now(),
    witnesses,
  } = report;

  const catDef = violationCategory ? VIOLATION_CATEGORIES[violationCategory] : null;
  const catLabel = catDef?.label || 'Violation';
  const isUrgent = catDef?.urgency === 'urgent';

  const dateStr = formatDate(incidentTime);
  const timeStr = formatTime(incidentTime);

  const instanceLine = worldName
    ? `"${worldName}"${instanceId ? ` (instance: ${instanceId})` : ''}`
    : worldId
      ? `instance ID ${instanceId || worldId}`
      : 'an instance I was in';

  const evidenceNote = hasEvidence
    ? `\nI have ${evidenceType === 'both' ? 'screenshots and video footage' : evidenceType === 'video' ? 'video footage' : 'screenshot(s)'} documenting this incident and can provide them upon request.`
    : '';

  const witnessNote = witnesses?.trim()
    ? `\nOther community members present at the time: ${witnesses.trim()}.`
    : '';

  const subtypeNote = violationSubtype ? ` (${violationSubtype})` : '';

  let body = '';

  switch (violationCategory) {
    case 'harassment':
      body = `I am writing to report ${reportType === 'group' ? `the group "${targetName}"` : `${targetName} (User ID: ${targetId})`} for harassment and bullying behaviour${subtypeNote}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.${violationSubtype === 'Ongoing / repeated pattern' ? '\n\nThis is part of an ongoing, repeated pattern of behaviour and not an isolated incident. The reported ${reportType} has targeted me on multiple occasions.' : ''}
${evidenceNote}${witnessNote}

The behaviour I experienced made me feel unsafe and unwelcome in VRChat. I respectfully request that this report be reviewed and appropriate action taken to protect the community.`;
      break;

    case 'hate_speech':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for the use of hate speech and discriminatory language directed at${subtypeNote ? ` individuals based on ${violationSubtype}` : ' a protected group'}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

This type of language has no place in VRChat and I ask that this report be reviewed and appropriate action taken.`;
      break;

    case 'nsfw_content':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for displaying or sharing sexual / NSFW content in a public or general-audience instance${subtypeNote ? ` (type: ${violationSubtype})` : ''}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

This content is inappropriate for a shared social space and I request that this report be reviewed urgently.`;
      break;

    case 'cheating':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for cheating and abusing game exploits${subtypeNote ? ` (${violationSubtype})` : ''}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

This behaviour disrupts the experience for everyone in the instance. I request that this report be reviewed and the appropriate action taken.`;
      break;

    case 'impersonation':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for impersonation${subtypeNote ? ` (${violationSubtype})` : ''}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

Impersonation is misleading and harmful to the community. I request that this report be reviewed and the account actioned appropriately.`;
      break;

    case 'spam':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for sending unsolicited spam, advertising, or repetitive disruptive messages.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

I request that this behaviour be reviewed and addressed.`;
      break;

    case 'self_harm':
      body = `URGENT — I am writing to report content related to self-harm or a potential real-world crisis involving ${targetName} (User ID: ${targetId}).

This occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

I am concerned for the wellbeing of the individual involved and potentially others who witnessed this content. Please review this report as a priority.`;
      break;

    case 'doxxing':
      body = `I am writing to report ${targetName} (User ID: ${targetId}) for sharing personal/private information without consent${subtypeNote ? ` (${violationSubtype})` : ''}.

The incident occurred on ${dateStr} at approximately ${timeStr} in ${instanceLine}.
${evidenceNote}${witnessNote}

Sharing personal information without consent is a serious privacy violation. I request immediate review and removal of this content.`;
      break;

    case 'group_misuse':
      body = `I am writing to report the group "${targetName}" (Group ID: ${targetId}) for misuse of group features${subtypeNote ? ` (${violationSubtype})` : ''}.

I observed this issue on ${dateStr} at approximately ${timeStr}.
${evidenceNote}${witnessNote}

I request that this group be reviewed and that appropriate action be taken to ensure the group operates within VRChat's community standards.`;
      break;

    case 'group_harassment':
      body = `I am writing to report the group "${targetName}" (Group ID: ${targetId}) for organising or participating in coordinated harassment against community members.

The harassment campaign was active as of ${dateStr}.
${evidenceNote}${witnessNote}

Coordinated harassment is a serious violation of VRChat's community guidelines. I request that this group be reviewed urgently and appropriate action taken.`;
      break;

    default:
      body = `I am writing to report ${targetName}${targetId ? ` (ID: ${targetId})` : ''} for a violation of VRChat's community standards.

The incident occurred on ${dateStr} at approximately ${timeStr}${worldName ? ` in "${worldName}"` : ''}.
${evidenceNote}${witnessNote}

I request that this report be reviewed and appropriate action taken.`;
  }

  const urgentHeader = isUrgent ? 'URGENT — ' : '';

  return `Subject: ${urgentHeader}${catLabel} Report – ${targetName}

Hello VRChat Trust & Safety Team,

${body}

Thank you for your time and for maintaining a safe community.

---
Report submitted via VRC Studio on ${new Date().toLocaleDateString('en-GB')}.`;
}
