export interface DemoActivity {
  readonly id: string;
  readonly label: string;
  readonly meta: string;
  readonly time: string;
  readonly type: 'listing' | 'lost-found' | 'project' | 'service';
}

export interface DemoProject {
  readonly compatibility: number;
  readonly description: string;
  readonly id: string;
  readonly members: number;
  readonly skills: readonly string[];
  readonly status: 'Active' | 'Recruiting';
  readonly title: string;
}

export interface DemoService {
  readonly category: string;
  readonly id: string;
  readonly price: string;
  readonly provider: string;
  readonly rating: number;
  readonly title: string;
}

export interface DemoNotification {
  readonly id: string;
  readonly message: string;
  readonly read: boolean;
  readonly time: string;
  readonly title: string;
  readonly type: 'marketplace' | 'message' | 'project' | 'system';
}

export interface DemoConversation {
  readonly id: string;
  readonly name: string;
  readonly context: string;
  readonly lastMessage: string;
  readonly time: string;
  readonly unread: number;
}

export interface DemoMetric {
  readonly change: string;
  readonly label: string;
  readonly value: string;
}
