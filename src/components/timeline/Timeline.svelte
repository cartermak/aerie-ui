<svelte:options immutable={true} />

<script lang="ts">
  import type { ScaleTime } from 'd3-scale';
  import { zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
  import { throttle } from 'lodash-es';
  import { afterUpdate, createEventDispatcher, onDestroy, onMount, tick } from 'svelte';
  import { SOURCES, TRIGGERS, dndzone } from 'svelte-dnd-action';
  import { InvalidDate } from '../../constants/time';
  import { plugins } from '../../stores/plugins';
  import { viewAddTimelineRow, viewUpdateTimeline } from '../../stores/views';
  import type { ActivityDirectiveId, ActivityDirectivesMap } from '../../types/activity';
  import type { User } from '../../types/app';
  import type { ConstraintResultWithName } from '../../types/constraint';
  import type { Plan } from '../../types/plan';
  import type {
    ResourceType,
    Simulation,
    SimulationDataset,
    Span,
    SpanId,
    SpanUtilityMaps,
    SpansMap,
  } from '../../types/simulation';
  import type {
    ActivityTreeExpansionMap,
    MouseDown,
    MouseOver,
    Row,
    TimeRange,
    Timeline,
    XAxisTick,
  } from '../../types/timeline';
  import { clamp } from '../../utilities/generic';
  import { formatDate } from '../../utilities/time';
  import { MAX_CANVAS_SIZE, TimelineInteractionMode, TimelineLockStatus, getXScale } from '../../utilities/timeline';
  import TimelineRow from './Row.svelte';
  import RowHeaderDragHandleWidth from './RowHeaderDragHandleWidth.svelte';
  import TimelineContextMenu from './TimelineContextMenu.svelte';
  import TimelineCursors from './TimelineCursors.svelte';
  import TimelineHistogram from './TimelineHistogram.svelte';
  import TimelineSimulationRange from './TimelineSimulationRange.svelte';
  import TimelineTimeDisplay from './TimelineTimeDisplay.svelte';
  import Tooltip from './Tooltip.svelte';
  import TimelineXAxis from './XAxis.svelte';

  export let activityDirectivesMap: ActivityDirectivesMap = {};
  export let constraintResults: ConstraintResultWithName[] = [];
  export let hasUpdateDirectivePermission: boolean = false;
  export let hasUpdateSimulationPermission: boolean = false;
  export let maxTimeRange: TimeRange = { end: 0, start: 0 };
  export let planEndTimeDoy: string;
  export let plan: Plan | null = null;
  export let planStartTimeYmd: string;
  export let resourceTypes: ResourceType[] = [];
  export let selectedActivityDirectiveId: ActivityDirectiveId | null = null;
  export let selectedSpanId: SpanId | null = null;
  export let simulation: Simulation | null = null;
  export let simulationDataset: SimulationDataset | null = null;
  export let spanUtilityMaps: SpanUtilityMaps;
  export let spansMap: SpansMap = {};
  export let spans: Span[] = [];
  export let timeline: Timeline | null = null;
  export let timelineInteractionMode: TimelineInteractionMode;
  export let timelineLockStatus: TimelineLockStatus;
  export let viewTimeRange: TimeRange = { end: 0, start: 0 };
  export let user: User | null;

  export let decimate: boolean = false;
  export let interpolateHoverValue: boolean = false;
  export let showTimelineTooltip: boolean = false;
  export let limitTooltipToLine: boolean = false;

  const dispatch = createEventDispatcher<{
    mouseDown: MouseDown;
    toggleRowExpansion: { expanded: boolean; rowId: number };
    updateRowHeight: {
      newHeight: number;
      rowId: number;
      wasAutoAdjusted?: boolean;
    };
    updateRows: Row[];
    viewTimeRangeChanged: TimeRange;
  }>();

  let activityTreeExpansionMapByRow: Record<string, ActivityTreeExpansionMap> = {};
  let timelineZoomTransform: ZoomTransform | null = null;
  let clientWidth: number = 0;
  let contextMenu: MouseOver | null;
  let contextMenuComponent: TimelineContextMenu;
  let dpr: number = 1;
  let tooltip: Tooltip;
  let cursorEnabled: boolean = true;
  let cursorHeaderHeight: number = 0;
  let histogramCursorTime: Date | null = null;
  let mouseOver: MouseOver | null;
  let removeDPRChangeListener: (() => void) | null = null;
  let rowDragMoveDisabled = true;
  let rowsMaxHeight: number = 600;
  let rows: Row[] = [];
  let rowHeaderDragHandleWidthPx: number = 2;
  let tickCount: number = 10;
  let timelineDiv: HTMLDivElement;
  let timelineHistogramDiv: HTMLDivElement;
  let timelineHistogramDrawHeight: number = 40;
  let xAxisDiv: HTMLDivElement;
  let xAxisDrawHeight: number = 64;
  let xTicksView: XAxisTick[] = [];

  let throttledZoom = throttle(onZoom, 16, {
    leading: true,
    trailing: true,
  });

  let throttledHistogramViewTimeRangeChanged = throttle(onHistogramViewTimeRangeChanged, 16, {
    leading: true,
    trailing: true,
  });

  $: activityDirectives = Object.values(activityDirectivesMap);

  $: rows = timeline?.rows || [];
  $: drawWidth = clientWidth > 0 ? clientWidth - (timeline?.marginLeft ?? 0) - (timeline?.marginRight ?? 0) : 0;
  $: xAxisDrawHeight = 48 + 16 * ($plugins.time.additional.length ? Math.max($plugins.time.additional.length, 1) : 1);

  // Compute number of ticks based off draw width
  $: if (drawWidth) {
    const padding = 1.5;
    let ticks = Math.round(drawWidth / ($plugins.time.ticks.maxLabelWidth * padding));
    tickCount = clamp(ticks, 2, 16);

    // Recompute zoom transform based off new drawWidth
    recomputeZoomTransform(viewTimeRange, drawWidth, xScaleMax);
  }

  $: setRowsMaxHeight(timelineDiv, xAxisDiv, timelineHistogramDiv);
  $: xDomainMax = [new Date(maxTimeRange.start), new Date(maxTimeRange.end)];
  $: viewTimeRangeStartDate = new Date(viewTimeRange.start);
  $: viewTimeRangeEndDate = new Date(viewTimeRange.end);
  $: xDomainView = [viewTimeRangeStartDate, viewTimeRangeEndDate];
  $: xScaleMax = getXScale(xDomainMax, drawWidth);
  $: xScaleView = getXScale(xDomainView, drawWidth);
  $: xScaleViewDuration = viewTimeRange.end - viewTimeRange.start;
  $: formattedPlanStartTime = formatDate(xDomainMax[0], $plugins.time.primary.format);
  $: formattedPlanEndTime = formatDate(xDomainMax[1], $plugins.time.primary.format);

  $: if (viewTimeRangeStartDate && viewTimeRangeEndDate && tickCount) {
    xTicksView = $plugins.time.ticks.getTicks(viewTimeRangeStartDate, viewTimeRangeEndDate, tickCount).map(date => {
      const label = $plugins.time.primary.formatTick(date, xScaleViewDuration, tickCount) ?? InvalidDate;
      const additionalLabels = $plugins.time.additional.map(timeSystem => {
        return timeSystem.formatTick
          ? timeSystem.formatTick(date, xScaleViewDuration, tickCount) ?? InvalidDate
          : timeSystem.format(date) ?? InvalidDate;
      });
      return { additionalLabels, date, label };
    });
  }

  afterUpdate(() => {
    setRowsMaxHeight(timelineDiv, xAxisDiv, timelineHistogramDiv);
  });

  onDestroy(() => {
    if (removeDPRChangeListener !== null) {
      removeDPRChangeListener();
    }
  });

  onMount(() => {
    detectDPRChange();
  });

  function recomputeZoomTransform(
    viewTimeRange: TimeRange,
    drawWidth: number,
    xScaleMax: ScaleTime<number, number, never>,
  ) {
    const extent = [viewTimeRange.start, viewTimeRange.end];
    const transform = zoomIdentity
      // width of full domain relative to the view domain
      .scale(Math.max(1, drawWidth / (xScaleMax(extent[1]) - xScaleMax(extent[0]))))
      // Shift the transform to account for starting value
      .translate(-xScaleMax(extent[0]), 0);
    timelineZoomTransform = transform;
  }

  function detectDPRChange() {
    // Adapted from https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio#monitoring_screen_resolution_or_zoom_level_changes

    if (removeDPRChangeListener !== null) {
      removeDPRChangeListener();
    }

    // Create new change listener using current DPR
    const mqString = `(resolution: ${window.devicePixelRatio}dppx)`;
    const deviceMedia = matchMedia(mqString);
    deviceMedia.addEventListener('change', detectDPRChange);
    removeDPRChangeListener = () => deviceMedia.removeEventListener('change', detectDPRChange);

    dpr = window.devicePixelRatio;
  }

  function handleDndConsiderRows(e: CustomEvent<DndEvent>) {
    const { detail } = e;
    const { info } = detail;
    const { trigger } = info;
    rows = detail.items as Row[];
    if (trigger === TRIGGERS.DRAG_STOPPED) {
      rowDragMoveDisabled = true;
    }
  }

  function handleDndFinalizeRows(e: CustomEvent<DndEvent>) {
    const { detail } = e;
    const { info } = detail;
    const { source } = info;
    rows = detail.items as Row[];
    if (source === SOURCES.POINTER) {
      rowDragMoveDisabled = true;
    }
    dispatch('updateRows', rows);
  }

  function handleScroll(event: WheelEvent) {
    // Prevent default scroll behavior when meta key is pressed
    // as to not interfere with certain zoom scenarios
    if (event.metaKey || timelineInteractionMode === TimelineInteractionMode.Navigate) {
      event.preventDefault();
    }
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 't' && event.ctrlKey) {
      cursorEnabled = !cursorEnabled;
    }
  }

  function onMouseDown(event: CustomEvent<MouseDown>) {
    dispatch('mouseDown', { ...event.detail, timelineId: timeline?.id });
  }

  function onMouseDownRowMove(event: Event) {
    event.preventDefault();
    rowDragMoveDisabled = false;
  }

  function onMouseUpRowMove(event: Event) {
    event.preventDefault();
    rowDragMoveDisabled = true;
  }

  function onToggleRowExpansion(event: CustomEvent<{ expanded: boolean; rowId: number }>) {
    const { rowId, expanded } = event.detail;
    dispatch('toggleRowExpansion', { expanded, rowId });
  }

  function onUpdateRowHeight(event: CustomEvent<{ newHeight: number; rowId: number; wasAutoAdjusted?: boolean }>) {
    const { newHeight, rowId, wasAutoAdjusted } = event.detail;
    if (newHeight < MAX_CANVAS_SIZE) {
      dispatch('updateRowHeight', { newHeight, rowId, wasAutoAdjusted });
    }
  }

  export function viewTimeRangeChanged(viewTimeRange: TimeRange, zoomTransform?: ZoomTransform) {
    dispatch('viewTimeRangeChanged', viewTimeRange);
    // Assign zoom transform if provided to synchronize all d3 zoom handlers
    if (zoomTransform) {
      timelineZoomTransform = zoomTransform;
    } else {
      // Otherwise compute the zoom transform based on the view extent
      recomputeZoomTransform(viewTimeRange, drawWidth, xScaleMax);
    }
  }

  async function onHistogramViewTimeRangeChanged(event: CustomEvent<TimeRange>) {
    await tick();
    viewTimeRangeChanged(event.detail);
    mouseOver = null;
    histogramCursorTime = null;
  }

  function onCollapseActivityTree(event: CustomEvent<Row>) {
    const row = event.detail;
    activityTreeExpansionMapByRow = { ...activityTreeExpansionMapByRow, [row.id]: {} };
  }

  function onHistogramCursorTimeChanged(event: CustomEvent<Date | null>) {
    histogramCursorTime = event.detail;
  }

  function onUpdateRowHeaderWidth(event: CustomEvent<{ newWidth: number }>) {
    const { newWidth } = event.detail;
    viewUpdateTimeline('marginLeft', newWidth, timeline?.id);
    mouseOver = null;
    histogramCursorTime = null;
  }

  function onMoveRow(event: CustomEvent<{ direction: 'up' | 'down'; row: Row }>) {
    const {
      detail: { direction, row },
    } = event;
    const newRows = [...rows];
    const rowIndex = rows.findIndex(r => r.id === row.id);
    if (rowIndex < 0) {
      return;
    }
    if (direction === 'up') {
      if (rowIndex > 0) {
        const oldRow = newRows[rowIndex - 1];
        newRows[rowIndex - 1] = row;
        newRows[rowIndex] = oldRow;
      }
    } else if (direction === 'down') {
      if (rowIndex < rows.length - 1) {
        const oldRow = newRows[rowIndex + 1];
        newRows[rowIndex + 1] = row;
        newRows[rowIndex] = oldRow;
      }
    }
    dispatch('updateRows', newRows);
  }

  async function setRowsMaxHeight(
    timelineDiv: HTMLDivElement,
    xAxisDiv: HTMLDivElement,
    timelineHistogramDiv: HTMLDivElement,
  ) {
    await tick();
    if (timelineDiv && xAxisDiv && timelineDiv.parentElement) {
      const { clientHeight: parentHeight } = timelineDiv.parentElement;
      const offsetTop = xAxisDiv.clientHeight + timelineHistogramDiv.clientHeight;
      const maxHeight = parentHeight - offsetTop - cursorHeaderHeight;
      rowsMaxHeight = maxHeight;
    }
  }

  function onContextMenu(e: CustomEvent, row: Row) {
    // Allow right clicking on interactive tippy tooltips on the canvas
    // in order to copy text within the tooltips
    const a = e.detail.e.target as HTMLElement;
    if (a && a.classList.value && a.classList.value.indexOf('tippy') > -1) {
      return;
    }
    contextMenu = { ...e.detail, row };
    tooltip.hide();
  }

  async function onZoom(e: CustomEvent<D3ZoomEvent<HTMLCanvasElement, any>>) {
    await tick();
    const newScale = e.detail.transform.rescaleX(xScaleMax).domain();
    let [start, end] = newScale;

    // Clear timeline and histogram cursor if this is a pan event
    const isPanEvent = e.detail.sourceEvent.type === 'mousemove';
    if (isPanEvent) {
      mouseOver = null;
      histogramCursorTime = null;
    }
    viewTimeRangeChanged({ end: end.getTime(), start: start.getTime() }, e.detail.transform);

    // Hide context menu and tooltip
    contextMenu = null;
    if (contextMenuComponent.isShown()) {
      contextMenuComponent.hide();
    }
    mouseOver = null;
    if (tooltip.isShown()) {
      tooltip.hide();
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<div bind:this={timelineDiv} bind:clientWidth class="timeline" id={`timeline-${timeline?.id}`}>
  <div bind:this={timelineHistogramDiv} class="timeline-time-row">
    {#if plan}
      <TimelineTimeDisplay
        planStartTime={formattedPlanStartTime}
        planEndTime={formattedPlanEndTime}
        timeLabel={$plugins.time.primary.label}
        width={timeline?.marginLeft}
      />
    {/if}
    <div class="timeline-histogram-container">
      <TimelineHistogram
        {activityDirectives}
        {constraintResults}
        {cursorEnabled}
        drawHeight={timelineHistogramDrawHeight}
        {drawWidth}
        {mouseOver}
        {planStartTimeYmd}
        {simulationDataset}
        {spans}
        {timelineZoomTransform}
        {viewTimeRange}
        {xScaleView}
        {xScaleMax}
        on:cursorTimeChange={onHistogramCursorTimeChanged}
        on:viewTimeRangeChanged={throttledHistogramViewTimeRangeChanged}
        on:zoom={throttledZoom}
      />
    </div>
  </div>
  <div class="timeline-padded-content">
    <RowHeaderDragHandleWidth
      rowHeaderWidth={timeline?.marginLeft}
      on:updateRowHeaderWidth={onUpdateRowHeaderWidth}
      width={rowHeaderDragHandleWidthPx}
    />
    <div bind:this={xAxisDiv} style="height: {xAxisDrawHeight}px">
      <TimelineXAxis
        {constraintResults}
        drawHeight={xAxisDrawHeight}
        {drawWidth}
        marginLeft={timeline?.marginLeft ?? 0}
        {viewTimeRange}
        {xScaleView}
        {xTicksView}
        {timelineInteractionMode}
        {timelineZoomTransform}
        on:zoom={throttledZoom}
      />
    </div>
    <TimelineSimulationRange
      {cursorHeaderHeight}
      {drawWidth}
      marginLeft={timeline?.marginLeft}
      {simulationDataset}
      {xScaleView}
    />
    <TimelineCursors
      {cursorHeaderHeight}
      {cursorEnabled}
      {drawWidth}
      {histogramCursorTime}
      marginLeft={timeline?.marginLeft}
      {mouseOver}
      verticalGuides={timeline?.verticalGuides}
      {xScaleView}
      on:updateVerticalGuides
    />

    <div
      class="rows"
      style="max-height: {rowsMaxHeight}px"
      on:consider={handleDndConsiderRows}
      on:finalize={handleDndFinalizeRows}
      on:wheel={handleScroll}
      use:dndzone={{ dragDisabled: rowDragMoveDisabled, items: rows, type: 'rows' }}
    >
      {#each rows as row, i (row.id)}
        <div class="timeline-row-wrapper">
          <TimelineRow
            {activityDirectives}
            {activityDirectivesMap}
            activityTreeExpansionMap={activityTreeExpansionMapByRow[row.id]}
            on:activityTreeExpansionChange={e => {
              activityTreeExpansionMapByRow = { ...activityTreeExpansionMapByRow, [row.id]: e.detail };
            }}
            {...row.activityOptions ? { activityOptions: row.activityOptions } : null}
            autoAdjustHeight={row.autoAdjustHeight}
            {constraintResults}
            {dpr}
            drawHeight={row.height}
            {drawWidth}
            expanded={row.expanded}
            {hasUpdateDirectivePermission}
            horizontalGuides={row.horizontalGuides}
            id={row.id}
            index={i}
            layers={row.layers}
            name={row.name}
            marginLeft={timeline?.marginLeft}
            {planEndTimeDoy}
            {plan}
            {planStartTimeYmd}
            {rowDragMoveDisabled}
            {decimate}
            {interpolateHoverValue}
            {limitTooltipToLine}
            {rowHeaderDragHandleWidthPx}
            {selectedActivityDirectiveId}
            {selectedSpanId}
            {simulationDataset}
            {spanUtilityMaps}
            {spansMap}
            {timelineInteractionMode}
            {timelineLockStatus}
            {user}
            {viewTimeRange}
            {xScaleView}
            {xTicksView}
            yAxes={row.yAxes}
            {timelineZoomTransform}
            on:contextMenu={e => onContextMenu(e, row)}
            on:dblClick
            on:deleteActivityDirective
            on:mouseDown={onMouseDown}
            on:mouseDownRowMove={onMouseDownRowMove}
            on:mouseUpRowMove={onMouseUpRowMove}
            on:mouseOver={e => (mouseOver = { ...e.detail, row })}
            on:toggleRowExpansion={onToggleRowExpansion}
            on:updateRowHeight={onUpdateRowHeight}
            on:updateYAxes
            on:zoom={throttledZoom}
          />
        </div>
      {/each}
      <div class="new-row">
        <button on:click={_ => viewAddTimelineRow(timeline?.id, true)} class="w-100 st-button tertiary">
          New Row +
        </button>
      </div>
    </div>
  </div>

  <!-- Timeline Tooltip. -->
  <Tooltip bind:this={tooltip} {mouseOver} {interpolateHoverValue} hidden={!showTimelineTooltip} {resourceTypes} />

  <!-- Timeline Context Menu. -->
  <TimelineContextMenu
    {activityDirectivesMap}
    bind:this={contextMenuComponent}
    {contextMenu}
    {hasUpdateDirectivePermission}
    {hasUpdateSimulationPermission}
    {maxTimeRange}
    on:collapseActivityTree={onCollapseActivityTree}
    on:deleteActivityDirective
    on:jumpToActivityDirective
    on:jumpToSpan
    on:hide={() => (contextMenu = null)}
    on:updateVerticalGuides
    on:viewTimeRangeReset={() => viewTimeRangeChanged(maxTimeRange)}
    on:viewTimeRangeChanged={event => viewTimeRangeChanged(event.detail)}
    {simulation}
    {simulationDataset}
    {spansMap}
    {spanUtilityMaps}
    {plan}
    {planStartTimeYmd}
    verticalGuides={timeline?.verticalGuides ?? []}
    {xScaleView}
    {user}
    on:toggleActivityComposition
    on:editRow
    on:deleteRow
    on:moveRow={onMoveRow}
    on:duplicateRow
    on:insertRow
  />
</div>

<style>
  .rows {
    box-sizing: content-box;
    outline: none !important;
    overflow-x: hidden;
    overflow-y: auto;
  }

  .timeline {
    background-color: var(--st-gray-15);
    height: 100%;
    overflow-x: hidden;
    overflow-y: hidden;
    width: 100%;
    --timeline-divider-color: rgba(210, 210, 210, 1);
  }

  .timeline-time-row {
    background: white;
    border-bottom: 1px solid var(--timeline-divider-color);
    display: flex;
  }

  .timeline-histogram-container {
    padding: 4px 8px 4px 0px;
  }

  .timeline-padded-content {
    background: white;
    border-radius: 4px;
  }

  :global(#dnd-action-dragged-el .row-root) {
    background: white;
    border: 1px solid var(--st-gray-40);
    box-shadow: var(--st-shadow-popover);
  }

  .new-row {
    align-items: center;
    background: white;
    border-bottom: 1px solid var(--st-gray-20);
    display: flex;
    justify-content: center;
    position: relative;
    width: 100%;
    z-index: 4;
  }

  .new-row button {
    color: var(--st-gray-70);
    font-size: 10px;
  }
</style>
