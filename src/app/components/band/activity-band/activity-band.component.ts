import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgModule,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import {
  forEachCanvas,
  getXScale,
  rgbColorGenerator,
} from '../../../functions';
import { PointActivity, TimeRange, UpdateBand } from '../../../types';
import { SubBandService } from '../sub-band.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-activity-band',
  styleUrls: ['./activity-band.component.css'],
  templateUrl: './activity-band.component.html',
})
export class ActivityBandComponent implements AfterViewInit, OnChanges {
  @Input()
  bandId: string;

  @Input()
  color: string | undefined;

  @Input()
  drawHeight: number;

  @Input()
  drawWidth: number;

  @Input()
  height: number | undefined;

  @Input()
  id: string;

  @Input()
  layout: string | undefined;

  @Input()
  maxTimeRange: TimeRange;

  @Input()
  points: PointActivity[] | undefined;

  @Input()
  viewTimeRange: TimeRange;

  @Output()
  updateBand: EventEmitter<UpdateBand> = new EventEmitter<UpdateBand>();

  @ViewChild('canvas', { static: true })
  canvas: ElementRef<HTMLCanvasElement>;

  constructor(private subBandService: SubBandService) {}

  ngOnChanges(changes: SimpleChanges): void {
    let shouldRedraw = false;
    let shouldResize = false;

    if (changes.drawHeight && !changes.drawHeight.isFirstChange()) {
      shouldResize = true;
    }

    if (changes.drawWidth && !changes.drawWidth.isFirstChange()) {
      shouldResize = true;
    }

    if (changes.layout && !changes.layout.isFirstChange()) {
      shouldRedraw = true;
    }

    if (changes.points && !changes.points.isFirstChange()) {
      shouldRedraw = true;
    }

    if (changes.viewTimeRange && !changes.viewTimeRange.isFirstChange()) {
      shouldRedraw = true;
    }

    if (shouldResize) {
      this.resize();
    } else if (shouldRedraw) {
      this.redraw();
    }
  }

  ngAfterViewInit(): void {
    this.subBandService.setCanvases(
      this.id,
      this.canvas.nativeElement,
      this.drawHeight,
      this.drawWidth,
    );
    this.redraw();
  }

  getLabelTextWidth(
    canvases: HTMLCanvasElement[],
    point: PointActivity,
  ): number {
    let textWidth = 0;
    forEachCanvas(canvases, (canvas, ctx) => {
      if (!canvas.classList.contains('hidden')) {
        const fontSize = point.label?.fontSize || 12;
        const fontFace = point.label?.fontFace || 'Georgia';
        ctx.font = `${fontSize}px ${fontFace}`;
        ctx.textAlign = point.label?.align || 'start';
        ctx.textBaseline = point.label?.baseline || 'alphabetic';
        const labelText = point.label?.text || '';
        const textMetrics = ctx.measureText(labelText);
        textWidth = textMetrics.width;
      }
    });
    return textWidth;
  }

  @HostListener('window:resize', ['$event'])
  onWindowResize(): void {
    this.resize();
  }

  resize(): void {
    this.subBandService.updateCanvases(
      this.id,
      this.drawHeight,
      this.drawWidth,
    );
    this.redraw();
  }

  redraw(): void {
    const layout = this.layout || 'compact';
    if (layout === 'compact') {
      this.redrawCompact();
    } else {
      this.redrawWaterfall();
    }
  }

  /**
   * @note Only set the fill style and fill the rect for the hidden canvas.
   * Don't do anything else or it will mess up point selection.
   */
  redrawCanvases(
    canvases: HTMLCanvasElement[],
    end: number,
    height: number,
    hiddenCanvasColor: IterableIterator<string>,
    point: PointActivity,
    x: number,
    y: number,
  ) {
    const range = end - x;
    const width = Math.max(5.0, range);
    const rect = new Path2D();
    rect.rect(x, y, width, height);

    forEachCanvas(canvases, (canvas, ctx) => {
      if (canvas.classList.contains('hidden')) {
        const color = hiddenCanvasColor.next().value;
        this.subBandService.updateColorToPoint(this.id, color, point);
        ctx.fillStyle = color;
        ctx.fill(rect);
      } else {
        const selected = point.selected || false;
        if (selected) {
          ctx.fillStyle = '#f5ec42';
        } else {
          ctx.fillStyle = this.color || point?.color || '#d651ff';
        }

        // Rect.
        ctx.fill(rect);

        // Label Text.
        const hideLabel = point.label?.hidden || false;
        if (!hideLabel) {
          ctx.fillStyle = point.label?.color || '#000000';
          const fontSize = point.label?.fontSize || 12;
          const fontFace = point.label?.fontFace || 'Georgia';
          ctx.font = `${fontSize}px ${fontFace}`;
          ctx.textAlign = point.label?.align || 'start';
          ctx.textBaseline = point.label?.baseline || 'alphabetic';
          const labelText = point.label?.text || '';
          const textMetrics = ctx.measureText(labelText);
          const textWidth = textMetrics.width;
          ctx.fillText(labelText, x, y, textWidth);
        }
      }
    });
  }

  /**
   * @note Assumes points is sorted by x increasing.
   */
  redrawCompact() {
    const hiddenCanvasColor = rgbColorGenerator();
    const canvases = this.subBandService.getCanvases(this.id);

    forEachCanvas(canvases, (_, ctx) => {
      ctx.clearRect(0, 0, this.drawWidth, this.drawHeight);
    });

    const points = (this.points || []).filter(
      point =>
        point.x + point.duration >= this.viewTimeRange.start &&
        point.x <= this.viewTimeRange.end,
    );
    const xScale = getXScale(this.viewTimeRange, this.drawWidth);

    const activityHeight = 20;
    const rowPadding = 20;
    let largestY = Number.MIN_SAFE_INTEGER;
    const rows = {};

    for (let i = 0, l = points.length; i < l; ++i) {
      const point = points[i];
      const x = Math.floor(xScale(point.x));
      const end = Math.floor(xScale(point.x + point.duration));
      const textWidth = this.getLabelTextWidth(canvases, point);
      const width = end + textWidth;

      let row = 0.5;
      let rowFound = false;
      while (!rowFound) {
        if (rows[row] !== undefined && rows[row] >= x) {
          ++row;
        } else {
          rows[row] = width;
          rowFound = true;
        }
      }
      const y = row * (activityHeight + rowPadding);
      if (y > largestY) {
        largestY = y;
      }

      this.redrawCanvases(
        canvases,
        end,
        activityHeight,
        hiddenCanvasColor,
        point,
        x,
        y,
      );
    }

    const newHeight = largestY + activityHeight + rowPadding;
    if (this.height !== newHeight) {
      this.updateBand.emit({ id: this.bandId, update: { height: newHeight } });
    }
  }

  /**
   * @note Make sure we `Math.floor` D3 scale values so we don't do sub-pixel rendering.
   */
  redrawWaterfall() {
    const hiddenCanvasColor = rgbColorGenerator();
    const canvases = this.subBandService.getCanvases(this.id);

    forEachCanvas(canvases, (_, ctx) => {
      ctx.clearRect(0, 0, this.drawWidth, this.drawHeight);
    });

    const points = (this.points || []).filter(
      point =>
        point.x + point.duration >= this.viewTimeRange.start &&
        point.x <= this.viewTimeRange.end,
    );
    const xScale = getXScale(this.viewTimeRange, this.drawWidth);

    const rowHeight = Math.max(5, Math.floor(this.drawHeight / points.length));
    const height = Math.min(20, rowHeight - Math.ceil(rowHeight / 3));
    let y = 15; // Initial padding.

    for (let i = 0, l = points.length; i < l; ++i) {
      const point = points[i];
      const x = Math.floor(xScale(point.x));
      const end = Math.floor(xScale(point.x + point.duration));

      this.redrawCanvases(
        canvases,
        end,
        height,
        hiddenCanvasColor,
        point,
        x,
        y,
      );

      if (y + rowHeight + height <= this.drawHeight) {
        y += rowHeight;
      }
    }
  }
}

@NgModule({
  declarations: [ActivityBandComponent],
  exports: [ActivityBandComponent],
  imports: [CommonModule],
})
export class ActivityBandModule {}
