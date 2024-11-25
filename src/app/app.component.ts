import { Component } from '@angular/core';
import { ViewerComponent } from './viewer/viewer.component';

@Component({
	selector: 'app-root',
	imports: [ViewerComponent],
	templateUrl: './app.component.html',
	styleUrl: './app.component.scss',
})
export class AppComponent {
	title = 'swisstopo-3d-viewer';
}
