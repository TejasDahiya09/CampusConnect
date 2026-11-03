import { teamSizeIntent } from './assistant-team-size.js';
import type { TeamSizeQuery } from './assistant.types.js';
import {
  lostFoundContext,
  isSimilarReportRequest,
  itemAliases,
  containsItemTerm,
} from './assistant-lost-found-context.js';
import type { AssistantSourceType } from './assistant.types.js';

export interface AssistantAction {
  readonly label: string;
  readonly route: string;
}
const action = (label: string, route: string): AssistantAction => ({ label, route });
export const assistantActions = {
  marketplace: [
    action('Browse Marketplace', '/marketplace'),
    action('Sell an item', '/marketplace/new'),
  ],
  lost: [
    action('Open Lost & Found', '/lost-found'),
    action('Report lost item', '/lost-found/new?type=lost'),
  ],
  found: [
    action('Open Lost & Found', '/lost-found'),
    action('Report found item', '/lost-found/new?type=found'),
  ],
  teamup: [action('Explore TeamUp', '/teamup'), action('Create project', '/teamup/new')],
  services: [action('Browse Services', '/services'), action('Offer a service', '/services/new')],
  profile: [action('Open Profile', '/profile')],
  messages: [action('Open Messages', '/messages')],
  saved: [action('Saved listings', '/marketplace/saved')],
} as const;

export interface AssistantHelpPlan {
  readonly answer?: string;
  readonly guidance?: string;
  readonly teamSize?: TeamSizeQuery;
  readonly actions: readonly AssistantAction[];
  readonly source?: AssistantSourceType;
  readonly search?: string;
  readonly requiredTerms?: readonly string[];
  readonly reportType?: 'LOST' | 'FOUND';
}

/** Trusted navigation and workflow guidance; never creates records or calls a model. */
export function assistantHelpPlan(
  question: string,
  history: readonly string[] = [],
): AssistantHelpPlan | null {
  const q = question.toLowerCase();
  const context = lostFoundContext(question, history);
  const size = teamSizeIntent(question, history);
  if (size)
    return size.ambiguous
      ? {
          answer:
            'Do you mean the maximum total team size (including the lead), the number of current members, or additional teammates still needed? These are different counts.',
          actions: assistantActions.teamup,
        }
      : {
          source: 'TEAMUP',
          search: size.search,
          teamSize: size.query!,
          actions: assistantActions.teamup,
        };
  if (/\b(?:weather|temperature|temp now)\b/.test(q))
    return {
      answer:
        'Live weather is not connected. I can help with Marketplace, Lost & Found, TeamUp, Services, messages and your profile.',
      actions: [action('Explore campus features', '/home')],
    };
  if (context) {
    const actions = context.kind === 'LOST' ? assistantActions.lost : assistantActions.found;
    if (isSimilarReportRequest(q)) {
      if (!context.item.length)
        return {
          answer: 'What item should I look for? Include its name so I can avoid unrelated reports.',
          actions,
        };
      return {
        actions,
        source: 'LOST_FOUND',
        search:
          `Find ${context.kind === 'LOST' ? 'found' : 'lost'} reports for: ${context.details.join(' ')}`.slice(
            0,
            500,
          ),
        requiredTerms: context.item,
        reportType: context.kind === 'LOST' ? 'FOUND' : 'LOST',
      };
    }
    const item = context.item[0] ?? 'item';
    const guidance =
      context.kind === 'LOST'
        ? context.followUp
          ? `That helps describe your ${item}. Include those details in your lost-item report. You can ask me to find similar found-item reports next. No report has been created here.`
          : `Open Lost & Found and check found-item reports for your ${item}. Choose Report lost to record what happened, including a description and when and where you last saw it. No report has been created here.`
        : `Choose Report found in Lost & Found for the ${item}. Include where and when it was left, but keep ID numbers and private identifying details out of the public report. Use the claim workflow to check ownership. No report has been created here.`;
    if (context.kind === 'LOST' && !context.followUp && context.item.length)
      return {
        guidance:
          (context.theft
            ? 'If you suspect theft, contact appropriate campus security or local authorities. Lost & Found does not replace reporting theft.\n\n'
            : '') + guidance,
        source: 'LOST_FOUND',
        search: `Found ${context.item[0]} reports ${context.details.join(' ')}`.slice(0, 500),
        requiredTerms: context.item,
        reportType: 'FOUND',
        actions,
      };
    return {
      answer:
        (context.theft
          ? 'If you suspect theft, contact the appropriate campus security or local authorities. Lost & Found does not replace reporting theft.\n\n'
          : '') + guidance,
      actions,
    };
  }
  if (isSimilarReportRequest(q) && /\b(?:similar|matches)\b/.test(q))
    return {
      answer:
        'What item was lost or found? Tell me the item name before I search for related reports.',
      actions: assistantActions.lost,
    };
  if (/\b(?:edit|manage|update)\b.*\bprofile\b/.test(q))
    return {
      answer:
        'Open Profile, then Edit profile to update your student details. Use the available Save controls for each section.',
      actions: assistantActions.profile,
    };
  if (/\b(?:save|saved|bookmark)\b.*\blistings?\b/.test(q))
    return {
      answer: 'Use the bookmark control on a listing, then open Saved listings to find it again.',
      actions: assistantActions.saved,
    };
  if (/\b(?:message|contact|chat)\b.*\b(?:student|seller|another|someone)\b/.test(q))
    return {
      answer:
        'Open Messages for your conversations. On an eligible listing, use Message seller. Service contact depends on the existing request relationship. I cannot send a message for you.',
      actions: assistantActions.messages,
    };
  if (/\b(?:sell|selling)\b/.test(q) && /\b(?:how|want|can i)\b/.test(q))
    return {
      answer:
        'Open Marketplace and choose Sell an item. Enter the item details and optional photos, then submit your listing. CampusConnect does not process payments or delivery.',
      actions: assistantActions.marketplace,
    };
  if (/\b(?:create|start)\b.*\b(?:team|project)\b/.test(q))
    return {
      answer:
        'Open TeamUp and choose Create project. Describe the project, required skills and team size. Eligible students can apply while recruitment is open.',
      actions: assistantActions.teamup,
    };
  if (/\b(?:offer|publish)\b.*\b(?:skill|service)\b/.test(q))
    return {
      answer:
        'Open Services and choose Create service to describe your skills, pricing mode and availability. CampusConnect does not process payments.',
      actions: assistantActions.services,
    };
  if (/\b(?:what can i do here|navigate|navigation)\b/.test(q))
    return {
      answer:
        'Browse and sell in Marketplace, report lost or found belongings, find projects in TeamUp, discover Services, and use Messages and Profile.',
      actions: [
        action('Home', '/home'),
        ...assistantActions.marketplace.slice(0, 1),
        ...assistantActions.teamup.slice(0, 1),
        ...assistantActions.services.slice(0, 1),
      ],
    };
  if (
    /\b(?:marketplace|calculators?|textbooks?|second.hand|for sale|selling|books|electronics)\b/.test(
      q,
    )
  )
    return { actions: assistantActions.marketplace, source: 'MARKETPLACE', search: q };
  if (/\b(?:lost|found)\b/.test(q)) {
    const item = itemAliases.find((aliases) => aliases.some((term) => containsItemTerm(q, term)));
    return {
      actions: assistantActions.lost,
      source: 'LOST_FOUND',
      search: q,
      ...(item ? { requiredTerms: item } : {}),
    };
  }
  if (/\b(?:teamup|teammates|projects?|team members)\b/.test(q))
    return { actions: assistantActions.teamup, source: 'TEAMUP', search: q };
  if (/\b(?:services?|designer|graphic design|coding|tutor|hire)\b/.test(q))
    return { actions: assistantActions.services, source: 'SERVICE', search: q };
  return null;
}
