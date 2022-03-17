type ActivityId = number;

type ActivityType = {
  name: string;
  parameters: ParametersMap;
};

type ActivityTypesMap = Record<string, ActivityType>;

type Activity = {
  arguments: ArgumentsMap;
  children: string[] | null;
  duration: number | null;
  id: ActivityId;
  parent: string | null;
  startTime: string;
  type: string;
};

type ActivitiesMap = Record<ActivityId, Activity>;

type ActivityInsertInput = {
  arguments: ArgumentsMap;
  plan_id: number;
  start_offset: string;
  type: string;
};

type ActivitySetInput = Partial<ActivityInsertInput>;
