export const CREATE_ACTIVITY_INSTANCES = `
  mutation CreateActivityInstances(
    $activityInstances: [CreateActivityInstance]!
    $planId: ID!
  ) {
    createActivityInstances(
      activityInstances: $activityInstances
      planId: $planId
    ) {
      ids
      message
      success
    }
  }
`;

export const CREATE_ADAPTATION = `
  mutation CreateAdaptation(
    $file: Upload!
    $mission: String!
    $name: String!
    $owner: String!
    $version: String!
  ) {
    createAdaptation(
      file: $file
      mission: $mission
      name: $name
      owner: $owner
      version: $version
    ) {
      id
      message
      success
    }
  }
`;

export const CREATE_PLAN = `
  mutation CreatePlan(
    $adaptationId: String!
    $endTimestamp: String!
    $name: String!
    $startTimestamp: String!
  ) {
    createPlan(
      adaptationId: $adaptationId
      endTimestamp: $endTimestamp
      name: $name
      startTimestamp: $startTimestamp
    ) {
      id
      message
      success
    }
  }
`;

export const DELETE_ACTIVITY_INSTANCE = `
  mutation DeleteActivityInstance(
    $activityInstanceId: ID!
    $planId: ID!
  ) {
    deleteActivityInstance(
      activityInstanceId: $activityInstanceId
      planId: $planId
    ) {
      message
      success
    }
  }
`;

export const DELETE_ADAPTATION = `
  mutation DeleteAdaptation($id: ID!) {
    deleteAdaptation(id: $id) {
      message
      success
    }
  }
`;

export const DELETE_ADAPTATION_CONSTRAINTS = `
  mutation DeleteAdaptationConstraints(
    $adaptationId: ID!
    $names: [String!]!
  ) {
    deleteAdaptationConstraints(
      id: $adaptationId
      names: $names
    ) {
      message
      success
    }
  }
`;

export const DELETE_PLAN = `
  mutation DeletePlan($id: ID!) {
    deletePlan(id: $id) {
      message
      success
    }
  }
`;

export const GET_ADAPTATIONS = `
  query GetAdaptations {
    adaptations {
      id
      mission
      name
      owner
      version
    }
  }
`;

export const GET_PLAN_DETAIL = `
  query GetPlanDetail($id: ID!) {
    plan(id: $id) {
      activityInstances {
        children
        duration
        id
        parameters {
          name
          value
        }
        parent
        startTimestamp
        type
      }
      adaptation {
        activityTypes {
          name
          parameters {
            default
            name
            schema
          }
        }
        constraints {
          definition
          name
        }
      }
      adaptationId
      endTimestamp
      id
      name
      startTimestamp
    }
  }
`;

export const GET_PLANS_AND_ADAPTATIONS = `
  query GetPlansAndAdaptations {
    adaptations {
      id
      mission
      name
      owner
      version
    }
    plans {
      adaptationId
      endTimestamp
      id
      name
      startTimestamp
    }
  }
`;

export const SIMULATE = `
  query Simulate($adaptationId: String!, $planId: String!) {
    simulate(adaptationId: $adaptationId, planId: $planId) {
      activities {
        children
        duration
        id
        parameters {
          name
          value
        }
        parent
        startTimestamp
        type
      }
      message
      results {
        name
        schema
        start
        values {
          x
          y
        }
      }
      success
      violations {
        associations {
          activityInstanceIds
          resourceIds
        }
        constraint {
          name
        }
        windows {
          end
          start
        }
      }
    }
  }
`;

export const UPDATE_ACTIVITY_INSTANCE = `
  mutation UpdateActivityInstance(
    $activityInstance: UpdateActivityInstance!
    $planId: ID!
  ) {
    updateActivityInstance(
      activityInstance: $activityInstance
      planId: $planId
    ) {
      message
      success
    }
  }
`;

export const UPDATE_ADAPTATION_CONSTRAINTS = `
  mutation UpdateAdaptationConstraints(
    $adaptationId: ID!
    $constraints: [ConstraintDefinitionInput!]!
  ) {
    updateAdaptationConstraints(
      adaptationId: $adaptationId
      constraints: $constraints
    ) {
      message
      success
    }
  }
`;

export const VALIDATE_PARAMETERS = `
  query ValidateParameters(
    $activityTypeName: String!
    $adaptationId: ID!
    $parameters: [ActivityInstanceParameterInput!]!
  ) {
    validateParameters(
      activityTypeName: $activityTypeName
      adaptationId: $adaptationId
      parameters: $parameters
    ) {
      errors
      success
    }
  }
`;
