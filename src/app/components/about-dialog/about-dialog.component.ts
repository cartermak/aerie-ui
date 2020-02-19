import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  Inject,
  NgModule,
} from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MaterialModule } from '../../material';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-about-dialog',
  styles: [''],
  template: `
    <h1 mat-dialog-title>About</h1>

    <div mat-dialog-content>
      <div *ngFor="let line of copyright">
        {{ line }}
      </div>
      <p>
        {{ data.version }}
      </p>
    </div>

    <div mat-dialog-actions>
      <button mat-button color="accent" matDialogClose>
        Close
      </button>
    </div>
  `,
})
export class AboutDialogComponent {
  copyright = [
    `Copyright ${new Date().getFullYear()}, by the California Institute of Technology.`,
    `ALL RIGHTS RESERVED.`,
    `United States Government sponsorship acknowledged.`,
    `Any commercial use must be negotiated with the Office of Technology Transfer at the California Institute of Technology.`,
  ];

  constructor(
    public dialogRef: MatDialogRef<AboutDialogComponent>,
    @Inject(MAT_DIALOG_DATA)
    public data: { version: string },
  ) {}
}

@NgModule({
  declarations: [AboutDialogComponent],
  entryComponents: [AboutDialogComponent],
  exports: [AboutDialogComponent],
  imports: [CommonModule, MaterialModule],
})
export class AboutDialogModule {}
