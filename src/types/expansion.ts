import type { PartialWith, UserId } from './app';
import type { SeqJson } from './sequencing';
import type { SpanId } from './simulation';
import type { Tag } from './tags';

export type ExpansionRule = {
  activity_type: string;
  authoring_mission_model_id: number;
  created_at: string;
  description: string;
  expansion_logic: string;
  id: number;
  name: string;
  owner: UserId;
  parcel_id: number;
  tags: { tag: Tag }[];
  updated_at: string;
  updated_by: UserId;
};

export type ExpansionRuleSlim = Omit<ExpansionRule, 'tags'> & { tags: { tag_id: number }[] };

export type ExpansionRuleInsertInput = Omit<
  ExpansionRuleSlim,
  'created_at' | 'id' | 'updated_at' | 'updated_by' | 'owner' | 'tags'
>;
export type ExpansionRuleSetInput = PartialWith<ExpansionRule, 'owner'>;

export type ExpansionSequenceToActivityInsertInput = {
  seq_id: string;
  simulated_activity_id: SpanId;
  simulation_dataset_id: number;
};

export type ExpansionSequence = {
  created_at: string;
  metadata: any;
  seq_id: string;
  simulation_dataset_id: number;
};

export type ExpansionSequenceInsertInput = Omit<ExpansionSequence, 'created_at' | 'updated_at'>;

export type ExpansionSet = {
  created_at: string;
  description: string;
  expansion_rules: ExpansionRuleSlim[];
  id: number;
  mission_model_id: number;
  name: string;
  owner: UserId;
  parcel_id: number;
  updated_at: string;
  updated_by: UserId;
};

export type SeqId = Pick<ExpansionSequence, 'seq_id'>;

export type ActivityInstanceJoin = {
  simulated_activity: {
    activity_type_name: string;
    id: number;
  };
};

export type ExpandedSequence = {
  created_at: string;
  expanded_sequence: SeqJson;
  id: number;
  seq_id: string;
  sequence: {
    activity_instance_joins: ActivityInstanceJoin[];
  };
};

export type ExpansionRun = {
  created_at: string;
  expanded_sequences: ExpandedSequence[];
  expansion_set: ExpansionSet;
  id: number;
  simulation_dataset: {
    dataset_id: number;
    simulation: {
      plan: {
        id: number;
        name: string;
      };
    };
  };
};
