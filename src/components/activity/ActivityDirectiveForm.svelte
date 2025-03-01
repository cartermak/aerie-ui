<svelte:options immutable={true} />

<script lang="ts">
  import CheckIcon from '@nasa-jpl/stellar/icons/check.svg?component';
  import CloseIcon from '@nasa-jpl/stellar/icons/close.svg?component';
  import HistoryIcon from '@nasa-jpl/stellar/icons/history.svg?component';
  import PenIcon from '@nasa-jpl/stellar/icons/pen.svg?component';
  import { keyBy } from 'lodash-es';
  import { createEventDispatcher } from 'svelte';
  import { PlanStatusMessages } from '../../enums/planStatusMessages';
  import { activityErrorRollupsMap, activityValidationErrors } from '../../stores/errors';
  import { field } from '../../stores/form';
  import { plan, planReadOnly } from '../../stores/plan';
  import { plugins } from '../../stores/plugins';
  import type {
    ActivityDirective,
    ActivityDirectiveId,
    ActivityDirectiveRevision,
    ActivityDirectivesMap,
    ActivityPreset,
    ActivityType,
  } from '../../types/activity';
  import type { ActivityMetadataDefinition } from '../../types/activity-metadata';
  import type { User } from '../../types/app';
  import type {
    ActivityDirectiveInstantiationFailure,
    ActivityErrorCategories,
    ActivityErrorRollup,
  } from '../../types/errors';
  import type { FieldStore } from '../../types/form';
  import type { Argument, ArgumentsMap, FormParameter, ParameterName } from '../../types/parameter';
  import type { ActivityDirectiveTagsInsertInput, Tag, TagsChangeEvent } from '../../types/tags';
  import { getActivityMetadata } from '../../utilities/activities';
  import effects from '../../utilities/effects';
  import { isInstantiationError } from '../../utilities/errors';
  import { classNames, keyByBoolean } from '../../utilities/generic';
  import { getArguments, getFormParameters } from '../../utilities/parameters';
  import { permissionHandler } from '../../utilities/permissionHandler';
  import { featurePermissions } from '../../utilities/permissions';
  import { pluralize } from '../../utilities/text';
  import { formatDate, getDoyTime, getIntervalFromDoyRange, getUnixEpochTimeFromInterval } from '../../utilities/time';
  import { tooltip } from '../../utilities/tooltip';
  import { required } from '../../utilities/validators';
  import Collapse from '../Collapse.svelte';
  import ActivityMetadataField from '../activityMetadata/ActivityMetadataField.svelte';
  import DatePickerField from '../form/DatePickerField.svelte';
  import Field from '../form/Field.svelte';
  import Input from '../form/Input.svelte';
  import ExtraneousParameters from '../parameters/ExtraneousParameters.svelte';
  import Parameters from '../parameters/Parameters.svelte';
  import ActivityErrorsRollup from '../ui/ActivityErrorsRollup.svelte';
  import Highlight from '../ui/Highlight.svelte';
  import TagsInput from '../ui/Tags/TagsInput.svelte';
  import ActivityAnchorForm from './ActivityAnchorForm.svelte';
  import ActivityPresetInput from './ActivityPresetInput.svelte';

  export let activityDirective: ActivityDirective;
  export let activityDirectivesMap: ActivityDirectivesMap = {};
  export let activityMetadataDefinitions: ActivityMetadataDefinition[] = [];
  export let activityTypes: ActivityType[] = [];
  export let tags: Tag[] = [];
  export let editable: boolean = true;
  export let highlightKeys: string[] = [];
  export let modelId: number;
  export let planStartTimeYmd: string;
  export let showActivityName: boolean = false;
  export let showHeader: boolean = true;
  export let user: User | null;
  export let revision: ActivityDirectiveRevision | undefined = undefined;

  const dispatch = createEventDispatcher<{
    closeRevisionPreview: void;
    viewChangelog: void;
  }>();

  let activityErrorRollup: ActivityErrorRollup | undefined;
  let activityNameField = field<string>(activityDirective.name);
  let editingActivityName: boolean = false;
  let extraArguments: string[] = [];
  let formParameters: FormParameter[] = [];
  let onChangeActivityArgumentsController: AbortController | null = null;
  let hasUpdatePermission: boolean = false;
  let highlightKeysMap: Record<string, boolean> = {};
  let numOfUserChanges: number = 0;
  let parameterErrorMap: Record<string, string[]> = {};
  let parametersWithErrorsCount: number = 0;
  let startTime: string;
  let startTimeField: FieldStore<string>;

  $: if (user !== null && $plan !== null) {
    hasUpdatePermission =
      featurePermissions.activityDirective.canUpdate(user, $plan, activityDirective) && !$planReadOnly;
  }
  $: updatePermissionError = $planReadOnly
    ? PlanStatusMessages.READ_ONLY
    : 'You do not have permission to update this activity';
  $: highlightKeysMap = keyByBoolean(highlightKeys);
  $: activityType =
    (activityTypes ?? []).find(({ name: activityTypeName }) => activityDirective?.type === activityTypeName) ?? null;
  $: {
    const startTimeMs = getUnixEpochTimeFromInterval(
      planStartTimeYmd,
      revision ? revision.start_offset : activityDirective.start_offset,
    );
    startTime = formatDate(new Date(startTimeMs), $plugins.time.primary.format);
  }

  $: startTimeField = field<string>(startTime, [required, $plugins.time.primary.validate]);
  $: activityNameField = field<string>(activityDirective.name);
  $: startTimeField.validateAndSet(startTime);
  $: activityNameField.validateAndSet(activityDirective.name);

  $: if (activityType && activityDirective.arguments) {
    effects
      .getEffectiveActivityArguments(
        modelId,
        activityType.name,
        revision ? revision.arguments : activityDirective.arguments,
        user,
      )
      .then(effectiveArguments => {
        if (effectiveArguments && activityType) {
          const { arguments: defaultArgumentsMap } = effectiveArguments;
          formParameters = getFormParameters(
            activityType.parameters,
            revision ? revision.arguments : activityDirective.arguments,
            activityType.required_parameters,
            revision ? undefined : activityDirective.applied_preset?.preset_applied?.arguments,
            defaultArgumentsMap,
          );
        }
      });
  }
  $: validateArguments(revision ? revision.arguments : activityDirective.arguments);
  $: numOfUserChanges = formParameters.reduce((previousHasChanges: number, formParameter) => {
    return /user/.test(formParameter.valueSource) ? previousHasChanges + 1 : previousHasChanges;
  }, 0);
  $: activityErrorRollup = $activityErrorRollupsMap[activityDirective.id];
  $: if (parameterErrorMap || $activityValidationErrors.length) {
    let missing: Record<string, true> = {};
    const activityValidationErrorsMap = keyBy($activityValidationErrors, 'activityId');
    const activityValidationError = activityValidationErrorsMap[activityDirective.id];

    extraArguments = [];

    if (activityValidationError) {
      const instantiationFailure: ActivityDirectiveInstantiationFailure | undefined =
        activityValidationError.errors.find(isInstantiationError) as ActivityDirectiveInstantiationFailure | undefined;
      if (instantiationFailure) {
        const { extraneousArguments, missingArguments } = instantiationFailure.errors;
        extraArguments = extraneousArguments;
        missing = missingArguments.reduce((prevArguments, missingArgument) => {
          return {
            ...prevArguments,
            [missingArgument]: true,
          };
        }, {});
      }
    }

    formParameters = formParameters.map((formParameter: FormParameter) => {
      let errors = parameterErrorMap[formParameter.name];
      if (missing[formParameter.name]) {
        if (!errors) {
          errors = [];
        }
        errors.push('Parameter not explicitly set');
      }
      return { ...formParameter, errors: errors || null };
    });

    parametersWithErrorsCount = Object.keys(parameterErrorMap).length;
  }
  $: getActivityMetadataValue = (key: string) => {
    const metadata = activityDirective.metadata;
    if (metadata) {
      return metadata[key];
    }
  };

  async function applyPresetToActivity(activityPreset: ActivityPreset | null, numOfUserChanges: number) {
    if (activityPreset === null && activityDirective.applied_preset && $plan) {
      await effects.removePresetFromActivityDirective(
        $plan,
        activityDirective.id,
        activityDirective.applied_preset.preset_id,
        user,
      );
    } else if (activityPreset !== null && $plan !== null) {
      await effects.applyPresetToActivity(activityPreset, activityDirective.id, $plan, numOfUserChanges, user);
    }
  }

  function editActivityName() {
    editingActivityName = true;
  }

  function getDisplayedArguments(): ArgumentsMap {
    return formParameters.reduce(
      (args: ArgumentsMap, { name, value }: { name: ParameterName; value: Argument }) => ({
        ...args,
        [name]: value,
      }),
      {},
    );
  }

  function updateAnchor({ detail: anchorId }: CustomEvent<ActivityDirectiveId | null>) {
    const { id } = activityDirective;
    if ($plan) {
      effects.updateActivityDirective($plan, id, { anchor_id: anchorId }, activityType, user);
    }
  }

  function updateAnchorEdge({ detail: isStart }: CustomEvent<boolean>) {
    const { id } = activityDirective;
    if ($plan) {
      effects.updateActivityDirective($plan, id, { anchored_to_start: isStart }, activityType, user);
    }
  }

  function updateStartOffset({ detail: offset }: CustomEvent<string>) {
    const { id } = activityDirective;
    if ($plan) {
      effects.updateActivityDirective($plan, id, { start_offset: offset }, activityType, user);
    }
  }

  async function onActivityNameKeyup(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if ($activityNameField.dirty) {
        resetActivityName();
      }
      editingActivityName = false;
    }
  }

  async function onApplyPresetToActivity(event: CustomEvent<ActivityPreset | null>) {
    const { detail: selectedPreset } = event;
    await applyPresetToActivity(selectedPreset, numOfUserChanges);
  }

  async function onChangeFormParameters(event: CustomEvent<FormParameter>) {
    const { detail: formParameter } = event;
    const { arguments: argumentsMap, id } = activityDirective;
    const newArguments = getArguments(argumentsMap, formParameter);
    if ($plan) {
      if (onChangeActivityArgumentsController) {
        onChangeActivityArgumentsController.abort();
      }
      onChangeActivityArgumentsController = new AbortController();
      await effects.updateActivityDirective(
        $plan,
        id,
        { arguments: newArguments },
        activityType,
        user,
        formParameter.file ? [formParameter.file] : [],
        onChangeActivityArgumentsController.signal,
      );
      onChangeActivityArgumentsController = null;
    }
  }

  function onAutoFixFormParameters(event: CustomEvent<ActivityErrorCategories>) {
    const { detail: selectedCategory } = event;
    const { id, arguments: activityArguments } = activityDirective;

    if (selectedCategory != null) {
      switch (selectedCategory) {
        case 'invalidParameter':
          if ($plan) {
            effects.updateActivityDirective($plan, id, { arguments: {} }, activityType, user);
          }
          break;
        case 'extra':
          if ($plan) {
            const cleanedArguments: ArgumentsMap = Object.keys(activityArguments).reduce(
              (prevArguments, argumentName) => {
                if (!extraArguments.includes(argumentName)) {
                  return {
                    ...prevArguments,
                    [argumentName]: activityArguments[argumentName],
                  };
                }
                return prevArguments;
              },
              {},
            );
            effects.updateActivityDirective($plan, id, { arguments: cleanedArguments }, activityType, user);
          }
          break;
      }
    }
  }

  function onResetFormParameters(event: CustomEvent<FormParameter>) {
    const { detail: formParameter } = event;
    const { arguments: argumentsMap, id } = activityDirective;
    const newArguments = getArguments(argumentsMap, {
      ...formParameter,
      value: activityDirective.applied_preset
        ? activityDirective.applied_preset.preset_applied.arguments[formParameter.name]
        : null,
    });
    if ($plan) {
      effects.updateActivityDirective($plan, id, { arguments: newArguments }, activityType, user);
    }
  }

  function onChangeActivityMetadata(event: CustomEvent<{ key: string; value: any }>) {
    const { detail } = event;
    const { key, value } = detail;
    const { id, metadata } = activityDirective;
    const newActivityMetadata = getActivityMetadata(metadata, key, value);
    if ($plan) {
      effects.updateActivityDirective($plan, id, { metadata: newActivityMetadata }, activityType, user);
    }
  }

  async function onDeletePreset(event: CustomEvent<ActivityPreset>) {
    const { detail: deletedActivityPreset } = event;
    if ($plan) {
      await effects.deleteActivityPreset(deletedActivityPreset, $plan.model.name, user);
    }
  }

  async function onSaveNewPreset(event: CustomEvent<{ name: string }>) {
    const {
      detail: { name },
    } = event;
    const createdActivityPreset = await effects.createActivityPreset(
      getDisplayedArguments(),
      activityDirective.type,
      name,
      modelId,
      user,
    );
    if (createdActivityPreset !== null) {
      await applyPresetToActivity(createdActivityPreset, 0);
    }
  }

  async function onSavePreset(event: CustomEvent<{ name: string }>) {
    const {
      detail: { name },
    } = event;
    if (activityDirective.applied_preset) {
      await effects.updateActivityPreset(
        {
          ...activityDirective.applied_preset.preset_applied,
          arguments: getDisplayedArguments(),
          model_id: modelId,
          name,
        },
        user,
      );
    }
  }

  async function onUpdateActivityName() {
    if ($activityNameField.dirty) {
      if ($activityNameField.value) {
        const { id } = activityDirective;
        if ($plan) {
          effects.updateActivityDirective($plan, id, { name: $activityNameField.value }, activityType, user);
        }
      } else {
        resetActivityName();
      }
    }
    editingActivityName = false;
  }

  function onUpdateStartTime() {
    if ($startTimeField.valid && startTime !== $startTimeField.value) {
      const { id } = activityDirective;
      const planStartTimeDoy = getDoyTime(new Date(planStartTimeYmd));
      const startTimeDate = $plugins.time.primary.parse($startTimeField.value);
      if (!startTimeDate) {
        return;
      }
      const startTimeDoy = getDoyTime(startTimeDate);
      const start_offset = getIntervalFromDoyRange(planStartTimeDoy, startTimeDoy);
      if ($plan) {
        effects.updateActivityDirective($plan, id, { start_offset }, activityType, user);
      }
    }
  }

  async function onTagsInputChange(event: TagsChangeEvent) {
    const {
      detail: { tag, type },
    } = event;
    if (type === 'remove') {
      await effects.deleteActivityDirectiveTags([tag.id], user);
    } else if (type === 'create' || type === 'select') {
      let tagsToAdd: Tag[] = [tag];
      if (type === 'create') {
        tagsToAdd = (await effects.createTags([{ color: tag.color, name: tag.name }], user)) || [];
      }
      const activityDirectiveTags: ActivityDirectiveTagsInsertInput[] = tagsToAdd.map(({ id: tag_id }) => ({
        directive_id: activityDirective.id,
        plan_id: activityDirective.plan_id,
        tag_id,
      }));
      await effects.createActivityDirectiveTags(activityDirectiveTags, user);
    }
  }

  function resetActivityName() {
    const initialValue = $activityNameField.initialValue;
    activityNameField.reset(initialValue);
    const { id } = activityDirective;
    if ($plan) {
      effects.updateActivityDirective($plan, id, { name: initialValue }, activityType, user);
    }
  }

  async function validateArguments(newArguments: ArgumentsMap | null): Promise<void> {
    if (newArguments) {
      const { type } = activityDirective;
      const { errors, success } = await effects.validateActivityArguments(type, modelId, newArguments, user);

      if (!success && errors) {
        parameterErrorMap = errors.reduce((map: Record<string, string[]>, error) => {
          error.subjects?.forEach(subject => {
            if (!map[subject]) {
              map[subject] = [];
            }
            map[subject].push(error.message);
          });
          return map;
        }, {});
      } else {
        parameterErrorMap = {};
      }
    }
  }

  async function restoreRevision(revisionId: number) {
    if (!$plan) {
      return;
    }

    const { id: activityId } = activityDirective;
    const restored = await effects.restoreActivityFromChangelog(activityId, $plan, revisionId, user);

    if (restored) {
      dispatch('closeRevisionPreview');
    }
  }
</script>

<div class="activity-form-container">
  {#if showHeader}
    <div class="activity-header">
      <div class={classNames('activity-header-title', { 'activity-header-title--editing': editingActivityName })}>
        {#if !editable}
          <div class="activity-header-title-value st-typography-medium">
            {revision ? revision.name : $activityNameField.value}
          </div>
        {:else if !editingActivityName}
          <button class="icon st-button activity-header-title-edit-button" on:click={editActivityName}>
            <div class="activity-header-title-value st-typography-medium">
              {$activityNameField.value}
            </div>
            <PenIcon />
          </button>
        {:else}
          <Field field={activityNameField} on:change={onUpdateActivityName}>
            <input
              on:keyup={onActivityNameKeyup}
              autocomplete="off"
              class="st-input w-100"
              name="activity-name"
              placeholder="Enter activity name"
            />
          </Field>
          <button
            use:tooltip={{ content: 'Save', placement: 'top' }}
            class="icon st-button"
            on:click={onUpdateActivityName}
          >
            <CheckIcon />
          </button>
        {/if}
      </div>
      <div class="activity-header-icons">
        <div class="activity-error-rollup">
          <ActivityErrorsRollup
            counts={activityErrorRollup?.errorCounts}
            hasPermission={hasUpdatePermission}
            mode="minimal"
            permissionError={updatePermissionError}
            selectable={false}
            on:resetCategory={onAutoFixFormParameters}
          />
        </div>
        <button
          class="st-button icon activity-header-changelog"
          on:click|stopPropagation={() => dispatch('viewChangelog')}
          use:tooltip={{ content: 'View Activity Changelog', placement: 'top' }}
        >
          <HistoryIcon />
        </button>
      </div>
    </div>
  {/if}

  {#if revision}
    <div class="revision-preview-header">
      <div>
        <button
          class="st-button primary"
          use:permissionHandler={{
            hasPermission: hasUpdatePermission,
            permissionError: updatePermissionError,
          }}
          on:click|stopPropagation={() => revision && restoreRevision(revision.revision)}
        >
          Restore
        </button>
        <span class="st-typography-medium">{highlightKeys.length} Change{pluralize(highlightKeys.length)}</span>
      </div>
      <button
        use:tooltip={{ content: 'Close Revision Preview', placement: 'top' }}
        class="icon st-button"
        on:click|stopPropagation={() => dispatch('closeRevisionPreview')}
      >
        <CloseIcon />
      </button>
    </div>
  {/if}

  <div class="activity-form">
    <fieldset>
      <Collapse title="Definition">
        {#if showActivityName}
          <Highlight highlight={highlightKeysMap.name}>
            <Input layout="inline">
              <label use:tooltip={{ content: 'Activity Name', placement: 'top' }} for="activityName">
                Activity Name
              </label>
              <input class="st-input w-100" disabled name="activityName" value={activityDirective.name} />
            </Input>
          </Highlight>
        {/if}

        <Highlight highlight={highlightKeysMap.id}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Activity ID', placement: 'top' }} for="id"> ID</label>
            <input class="st-input w-100" disabled name="id" value={activityDirective.id} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.type}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Activity Type', placement: 'top' }} for="activity-type">
              Activity Type
            </label>
            <input class="st-input w-100" disabled name="activity-type" value={activityDirective.type} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.start_offset}>
          <DatePickerField
            useFallback={!$plugins.time.enableDatePicker}
            disabled={!editable || activityDirective.anchor_id !== null}
            field={startTimeField}
            label={`Start Time (${$plugins.time.primary.label}) - ${$plugins.time.primary.formatString}`}
            layout="inline"
            name="start-time"
            use={[
              [
                permissionHandler,
                {
                  hasPermission: hasUpdatePermission,
                  permissionError: updatePermissionError,
                },
              ],
            ]}
            on:change={onUpdateStartTime}
            on:keydown={onUpdateStartTime}
          />
        </Highlight>

        <ActivityAnchorForm
          {activityDirective}
          {activityDirectivesMap}
          {hasUpdatePermission}
          anchorId={revision ? revision.anchor_id : activityDirective.anchor_id}
          disabled={!editable}
          {highlightKeysMap}
          planReadOnly={$planReadOnly}
          isAnchoredToStart={revision ? revision.anchored_to_start : activityDirective.anchored_to_start}
          startOffset={revision ? revision.start_offset : activityDirective.start_offset}
          on:updateAnchor={updateAnchor}
          on:updateAnchorEdge={updateAnchorEdge}
          on:updateStartOffset={updateStartOffset}
        />

        <Highlight highlight={highlightKeysMap.created_at}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Creation Time (UTC)', placement: 'top' }} for="creationTime">
              Creation Time (UTC)
            </label>
            <input class="st-input w-100" disabled name="creationTime" value={activityDirective.created_at} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.last_modified_at}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Last Modified Time (UTC)', placement: 'top' }} for="lastModifiedTime">
              Last Modified Time (UTC)
            </label>
            <input class="st-input w-100" disabled name="lastModifiedTime" value={activityDirective.last_modified_at} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.last_modified_by}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Last Modified By', placement: 'top' }} for="modifiedBy">
              Last Modified By
            </label>
            <input class="st-input w-100" disabled name="modifiedBy" value={activityDirective.last_modified_by} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.last_modified_by}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Created By', placement: 'top' }} for="createdBy"> Created By </label>
            <input class="st-input w-100" disabled name="createdBy" value={activityDirective.created_by} />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.source_scheduling_goal_id}>
          <Input layout="inline">
            <label
              use:tooltip={{ content: 'Source Scheduling Goal ID', placement: 'top' }}
              for="sourceSchedulingGoalId"
            >
              Source Scheduling Goal ID
            </label>
            <input
              class="st-input w-100"
              disabled
              name="sourceSchedulingGoalId"
              value={activityDirective.source_scheduling_goal_id ?? 'None'}
            />
          </Input>
        </Highlight>

        <Highlight highlight={highlightKeysMap.tags}>
          <Input layout="inline">
            <label use:tooltip={{ content: 'Tags', placement: 'top' }} for="activityDirectiveTags"> Tags </label>
            <TagsInput
              options={tags}
              selected={activityDirective.tags.map(({ tag }) => tag)}
              use={[
                [
                  permissionHandler,
                  {
                    hasPermission: hasUpdatePermission,
                    permissionError: updatePermissionError,
                  },
                ],
              ]}
              on:change={onTagsInputChange}
            />
          </Input>
        </Highlight>
      </Collapse>
    </fieldset>

    <fieldset>
      <Collapse
        error={parametersWithErrorsCount > 0}
        title={`Parameters${parametersWithErrorsCount > 0 ? ` (${parametersWithErrorsCount} invalid)` : ''}`}
      >
        <div class="activity-preset">
          <ActivityPresetInput
            {modelId}
            {activityDirective}
            disabled={!editable}
            hasChanges={numOfUserChanges > 0}
            {user}
            plan={$plan}
            on:applyPreset={onApplyPresetToActivity}
            on:deletePreset={onDeletePreset}
            on:saveNewPreset={onSaveNewPreset}
            on:savePreset={onSavePreset}
          />
        </div>
        <Parameters
          disabled={!editable}
          {formParameters}
          {highlightKeysMap}
          on:change={onChangeFormParameters}
          on:reset={onResetFormParameters}
          use={[
            [
              permissionHandler,
              {
                hasPermission: hasUpdatePermission,
                permissionError: updatePermissionError,
              },
            ],
          ]}
        />
        {#if formParameters.length === 0}
          <div class="st-typography-label">No Parameters Found</div>
        {/if}
      </Collapse>
    </fieldset>

    {#if extraArguments.length}
      <ExtraneousParameters
        {extraArguments}
        argumentsMap={activityDirective.arguments}
        hasPermission={hasUpdatePermission}
        permissionError={updatePermissionError}
        on:reset={onAutoFixFormParameters}
      />
    {/if}

    <fieldset>
      <Collapse title="Annotations">
        {#if activityMetadataDefinitions.length === 0}
          <div class="st-typography-label">No Annotations Found</div>
        {/if}

        {#each activityMetadataDefinitions as definition}
          <Highlight highlight={highlightKeysMap[definition.key]}>
            <ActivityMetadataField
              disabled={!editable}
              on:change={onChangeActivityMetadata}
              value={getActivityMetadataValue(definition.key)}
              {definition}
            />
          </Highlight>
        {/each}
      </Collapse>
    </fieldset>
  </div>
</div>

<style>
  .activity-form-container {
    display: grid;
    grid-template-rows: min-content auto;
    height: 100%;
    overflow: hidden;
  }

  .activity-form {
    overflow-y: auto;
  }

  .activity-form fieldset:last-child {
    padding-bottom: 16px;
  }

  .activity-directive-definition {
    padding: 0.5rem;
  }

  .activity-header {
    align-items: center;
    background: var(--st-gray-10);
    border-bottom: 1px solid var(--st-gray-15);
    display: flex;
    flex-shrink: 0;
    font-style: italic;
    padding: 4px 8px;
    padding-left: 8px;
  }

  .activity-header-icons {
    align-items: center;
    display: flex;
  }

  .activity-error-rollup {
    display: inline;
    font-style: normal;
  }

  .activity-header-title-placeholder,
  .activity-header-title-value {
    word-break: break-word;
  }

  .activity-header-title-value {
    overflow: hidden;
    padding: 4px 0px;
    text-overflow: ellipsis;
    white-space: nowrap;
    word-break: break-all;
  }

  .activity-header-title-placeholder {
    padding: 4px 8px;
  }

  .activity-header-title {
    align-items: flex-start;
    border-radius: 4px;
    display: flex;
    width: 100%;
  }

  .activity-header-title :global(fieldset) {
    padding: 0;
    width: 100%;
  }

  .activity-header-title-edit-button:hover {
    background-color: var(--st-white);
  }

  .activity-header-title:not(.activity-header-title--editing) .st-button :global(.st-icon) {
    display: none;
    flex-shrink: 0;
  }

  .activity-header-title:not(.activity-header-title--editing) .st-button {
    display: flex;
    gap: 8px;
    height: inherit;
    min-width: 0;
    padding: 0px 8px;
  }

  .activity-header-title:not(.activity-header-title--editing) .st-button:hover {
    background: var(--st-white);
  }

  .activity-header-title:not(.activity-header-title--editing):hover .st-button :global(.st-icon) {
    display: inherit;
  }

  .activity-header-title--editing {
    gap: 8px;
    padding: 0;
    width: 100%;
  }

  .activity-header-title--editing .st-input {
    background-color: var(--st-white);
    font-style: normal;
  }

  .activity-header-changelog {
    border: 1px solid transparent;
    display: flex;
    width: 24px;
  }

  .activity-header-changelog:hover {
    color: #007bff;
  }

  .revision-preview-header {
    align-items: center;
    background-color: #e6e6ff;
    border-bottom: 1px solid #c4c6ff;
    border-top: 1px solid #c4c6ff;
    display: flex;
    flex-shrink: 0;
    justify-content: space-between;
    padding: 4px 8px;
    padding-left: 8px;
  }

  .revision-preview-header span {
    font-style: italic;
    margin-left: 4px;
  }

  .revision-preview .icon {
    align-content: flex-end;
    display: flex;
  }

  .annotations {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
</style>
