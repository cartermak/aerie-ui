<svelte:options immutable={true} />

<script lang="ts">
  import { quadtree as d3Quadtree, type Quadtree } from 'd3-quadtree';
  import { scaleOrdinal, type ScaleTime } from 'd3-scale';
  import {
    schemeAccent,
    schemeCategory10,
    schemeDark2,
    schemePaired,
    schemePastel1,
    schemePastel2,
    schemeSet1,
    schemeSet2,
    schemeSet3,
    schemeTableau10,
  } from 'd3-scale-chromatic';
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import type { Resource } from '../../types/simulation';
  import type {
    MouseOver,
    QuadtreeRect,
    ResourceLayerFilter,
    RowMouseOverEvent,
    XRangeLayerColorScheme,
    XRangePoint,
  } from '../../types/timeline';
  import { clamp } from '../../utilities/generic';
  import { searchQuadtreeRect } from '../../utilities/timeline';

  export let contextmenu: MouseEvent | undefined;
  export let colorScheme: XRangeLayerColorScheme = 'schemeAccent';
  export let dpr: number = 1;
  export let drawHeight: number = 0;
  export let drawWidth: number = 0;
  export let filter: ResourceLayerFilter | undefined;
  export let id: number;
  export let mousemove: MouseEvent | undefined;
  export let mouseout: MouseEvent | undefined;
  export let opacity: number = 0.8;
  export let resources: Resource[] = [];
  export let xScaleView: ScaleTime<number, number> | null = null;

  const dispatch = createEventDispatcher<{
    contextMenu: MouseOver;
    mouseOver: RowMouseOverEvent;
  }>();
  const textMeasurementCache: Record<string, { textHeight: number; textWidth: number }> = {};
  // TODO maybe dynamically compute this number by looking at how much work there is to do for
  // all layers and dividing the time between them all?
  // TODO consider moving to GPU and/or offscreen canvas but would need to consider how to efficiently
  // transfer these points to a web worker
  const WORK_TIME_THRESHOLD = 16; // ms to allow for processing time, beyond which remaining work will be split to a new frame

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null;
  let domain: string[] = [];
  let maxXWidth: number;
  let mounted: boolean = false;
  let points: XRangePoint[] = [];
  let drawPointsRequest: number;
  let quadtree: Quadtree<QuadtreeRect>;
  let visiblePointsById: Record<number, XRangePoint> = {};

  $: canvasHeightDpr = drawHeight * dpr;
  $: canvasWidthDpr = drawWidth * dpr;
  $: if (
    canvasHeightDpr &&
    canvasWidthDpr &&
    drawHeight &&
    drawWidth &&
    dpr &&
    colorScheme &&
    filter &&
    mounted &&
    opacity !== undefined &&
    points &&
    xScaleView
  ) {
    draw();
  }
  $: onContextMenu(contextmenu);
  $: onMousemove(mousemove);
  $: onMouseout(mouseout);
  $: points = resourcesToXRangePoints(resources);

  onMount(() => {
    if (canvas) {
      ctx = canvas.getContext('2d');
    }
    mounted = true;
  });

  async function draw(): Promise<void> {
    if (ctx && xScaleView) {
      window.cancelAnimationFrame(drawPointsRequest);
      await tick();

      ctx.resetTransform();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, drawWidth, drawHeight);
      ctx.globalAlpha = opacity;

      quadtree = d3Quadtree<QuadtreeRect>()
        .x(p => p.x)
        .y(p => p.y)
        .extent([
          [0, 0],
          [drawWidth, drawHeight],
        ]);
      visiblePointsById = {};

      maxXWidth = Number.MIN_SAFE_INTEGER;
      drawPoints(points, 0);
    }
  }

  function drawPoints(points: XRangePoint[], pointsStartIndex = 0) {
    if (!xScaleView) {
      return;
    }
    const startTime = performance.now();

    const colorScale = getColorScale();

    const [viewStart, viewEnd] = xScaleView.domain().map(x => x.getTime());

    for (let i = pointsStartIndex; i < points.length; ++i) {
      if (performance.now() - startTime > WORK_TIME_THRESHOLD) {
        drawPointsRequest = window.requestAnimationFrame(() => drawPoints(points, i));
        return;
      }

      const point = points[i];
      if (point.is_gap || point.is_null) {
        continue;
      }

      // Scan to the next point with a different label than the current point.
      let j = i + 1;
      let nextPoint = points[j];
      while (nextPoint && nextPoint.label.text === point.label.text && nextPoint.is_gap === point.is_gap) {
        j = j + 1;
        nextPoint = points[j];
      }
      i = j - 1; // Minus since the loop auto increments i at the end of the block.

      const startMs = point.x;
      const endMs = nextPoint ? nextPoint.x : points[i].x;

      // Do not draw if box is out of view
      if (startMs > viewEnd || endMs < viewStart) {
        continue;
      }

      const xStart = clamp(xScaleView(point.x), 0, drawWidth);
      const xEnd = clamp(xScaleView(endMs), 0, drawWidth);

      const xWidth = xEnd - xStart;
      const y = 0;

      if (xWidth > 0 && ctx) {
        const { id } = point;
        visiblePointsById[id] = point;

        const labelText = point.label.text;
        ctx.fillStyle = colorScale(labelText);
        const rect = new Path2D();
        rect.rect(xStart, y, xWidth, drawHeight);
        ctx.fill(rect);

        quadtree.add({
          height: drawHeight,
          id,
          width: xWidth,
          x: xStart,
          y,
        });

        if (xWidth > maxXWidth) {
          maxXWidth = xWidth;
        }

        const { textHeight, textWidth } = setLabelContext(point);
        if (textWidth < xWidth) {
          ctx.fillText(labelText, xStart + xWidth / 2 - textWidth / 2, drawHeight / 2 + textHeight / 2, textWidth);
        } else {
          const extraLabelPadding = 8;
          let newLabelText = labelText;
          let newTextWidth = textWidth;

          // Remove characters from label until it is small enough to fit in x-range point.
          while (newTextWidth > 0 && newTextWidth > xWidth - extraLabelPadding) {
            newLabelText = newLabelText.slice(0, -1);
            const textMeasurement = measureText(newLabelText);
            newTextWidth = textMeasurement.textWidth;
          }

          // Only draw if text will be visible
          if (newTextWidth > 0) {
            ctx.fillText(
              `${newLabelText}...`,
              xStart + xWidth / 2 - newTextWidth / 2,
              drawHeight / 2 + textHeight / 2,
              newTextWidth,
            );
          }
        }
      }
    }
  }

  function getColorScale() {
    switch (colorScheme) {
      case 'schemeAccent':
        return scaleOrdinal(schemeAccent).domain(domain);
      case 'schemeCategory10':
        return scaleOrdinal(schemeCategory10).domain(domain);
      case 'schemeDark2':
        return scaleOrdinal(schemeDark2).domain(domain);
      case 'schemePaired':
        return scaleOrdinal(schemePaired).domain(domain);
      case 'schemePastel1':
        return scaleOrdinal(schemePastel1).domain(domain);
      case 'schemePastel2':
        return scaleOrdinal(schemePastel2).domain(domain);
      case 'schemeSet1':
        return scaleOrdinal(schemeSet1).domain(domain);
      case 'schemeSet2':
        return scaleOrdinal(schemeSet2).domain(domain);
      case 'schemeSet3':
        return scaleOrdinal(schemeSet3).domain(domain);
      case 'schemeTableau10':
        return scaleOrdinal(schemeTableau10).domain(domain);
      default:
        return scaleOrdinal(schemeTableau10).domain(domain);
    }
  }

  function measureText(text: string) {
    if (textMeasurementCache[text]) {
      return textMeasurementCache[text];
    }
    if (ctx) {
      const textMetrics = ctx.measureText(text);
      const textHeight = textMetrics.actualBoundingBoxAscent + textMetrics.actualBoundingBoxDescent;
      const textWidth = textMetrics.width;
      const measurement = { textHeight, textWidth };
      textMeasurementCache[text] = measurement;
      return measurement;
    }
    const measurement = { textHeight: 0, textWidth: 0 };
    return measurement;
  }

  function onContextMenu(e: MouseEvent | undefined): void {
    if (e) {
      dispatch('contextMenu', { e, origin: 'layer-x-range' });
    }
  }

  function onMousemove(e: MouseEvent | undefined): void {
    if (e) {
      const { offsetX: x, offsetY: y } = e;
      const points = searchQuadtreeRect<XRangePoint>(quadtree, x, y, drawHeight, maxXWidth, visiblePointsById);

      dispatch('mouseOver', { e, layerId: id, points });
    }
  }

  function onMouseout(e: MouseEvent | undefined): void {
    if (e) {
      dispatch('mouseOver', { e, layerId: id, points: [] });
    }
  }

  function resourcesToXRangePoints(resources: Resource[]): XRangePoint[] {
    const points: XRangePoint[] = [];
    let id = 0;

    for (const resource of resources) {
      const { name, schema, values } = resource;

      if (schema.type === 'boolean') {
        domain = ['TRUE', 'FALSE'];
        for (let i = 0; i < values.length; ++i) {
          const { x, y, is_gap } = values[i];
          const text = y ? 'TRUE' : 'FALSE';
          points.push({
            id: id++,
            is_gap,
            is_null: false,
            label: { text },
            name,
            type: 'x-range',
            x,
          });
        }
      } else if (schema.type === 'string') {
        const domainMap: Record<string, string> = {};
        for (let i = 0; i < values.length; ++i) {
          const { x, y, is_gap } = values[i];
          const isNull = y === null;
          const text = isNull ? '' : (y as string);
          points.push({
            id: id++,
            is_gap,
            is_null: isNull,
            label: { text },
            name,
            type: 'x-range',
            x,
          });
          if (!isNull) {
            domainMap[text] = text;
          }
        }
        domain = Object.values(domainMap);
      } else if (schema.type === 'variant') {
        domain = schema.variants.map(({ label }) => label);
        for (let i = 0; i < values.length; ++i) {
          const { x, y, is_gap } = values[i];
          const isNull = y === null;
          const text = isNull ? '' : (y as string);
          points.push({
            id: id++,
            is_gap,
            is_null: isNull,
            label: { text },
            name,
            type: 'x-range',
            x,
          });
        }
      }
    }

    return points;
  }

  function setLabelContext(point: XRangePoint): {
    labelText?: string;
    textHeight: number;
    textWidth: number;
  } {
    const fontSize = point.label?.fontSize || 10;
    const fontFace = point.label?.fontFace || 'Inter';
    if (ctx) {
      ctx.fillStyle = point.label?.color || '#000000';
      ctx.font = `${fontSize}px ${fontFace}`;
    }
    const labelText = point.label.text;
    const { textHeight, textWidth } = measureText(labelText);
    return { labelText, textHeight, textWidth };
  }
</script>

<canvas
  bind:this={canvas}
  height={canvasHeightDpr}
  id={`layer-x-range-${id}`}
  style="height: {drawHeight}px; width: {drawWidth}px;"
  width={canvasWidthDpr}
  on:contextmenu={onContextMenu}
/>

<style>
  canvas {
    position: absolute;
    z-index: -1;
  }
</style>
