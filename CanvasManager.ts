/*
	Canvas Adapters
*/

class CanvasManager {
	/*
		Manage a visible canvas
	*/

	// One point debug control
	static c_debug_rendering: boolean = false;

	protected animator_func: ( manager: CanvasManager, delta: number, time: number ) => void;
	protected canvas: HTMLCanvasElement;
	protected every_n_frames: number;
	protected skip_counter: number;
	protected context2d: CanvasRenderingContext2D;

	protected previous_timestamp: number;
	protected stop_the_animation: boolean;

	protected text_colour: string;
	protected background_colour: string;


	constructor( canvas: HTMLCanvasElement, animator_func: ( manager: CanvasManager, timestamp_milliseconds: number, delta_milliseconds: number ) => void, every_n_frames: number ){

		/*
		- resizes the canvas to fill its container
		- The animation func takes three parameters, us the render time and a delta milliseconds time (which can be zero)

		- every_n_frames is the number of animation frames before calling the user animation function. i.e. 1 is every frame.
		*/

		// Store
		this.animator_func = animator_func;
		this.canvas = canvas;
		this.every_n_frames = every_n_frames;
		this.skip_counter = 0;
		this.context2d = null;

		// Sort canvas - note, because of this you want to contain all <canvas> in a css'd div.
		this.resize_to_parent();

		// Sort context
		this.context2d = this.canvas.getContext( "2d" );

		// Animation data
		this.previous_timestamp = null;
		this.stop_the_animation = false;		// Set to true to stop animation cycle.

		// Colours - need storing as everything uses fillStyle
		this.text_colour = "black";
		this.background_colour = "white";

	}

	public destroy(): void {
		/*
			Stop animating, remove references.
		*/
		this.stop_animating();
		this.context2d = null;
	}


	public start_animating(): void {
		// NOTE: We need to do this because of scoping rules
		window.requestAnimationFrame( ( timestamp ) => this.animate( timestamp ) );
	}


	public stop_animating(): void {
		this.stop_the_animation = true;
	}


	public resize_to_parent(): void {
		this.canvas.style.width = '100%';
		this.canvas.style.height = '100%';
		this.canvas.width = this.canvas.offsetWidth;
		this.canvas.height = this.canvas.offsetHeight;

		if( CanvasManager.c_debug_rendering == true ){
			console.error( `CANVAS ${ this.canvas.id } SIZE PROPERTIES: offset: ${ this.canvas.offsetWidth } ${ this.canvas.offsetHeight }` );
			console.error( `CANVAS ${ this.canvas.id } SIZE PROPERTIES: client: ${ this.canvas.clientWidth } ${ this.canvas.clientHeight }` );
			console.error( `CANVAS ${ this.canvas.id } SIZE PROPERTIES: normal: ${ this.canvas.width } ${ this.canvas.height }` );
		}

		console.log( `CanvasManager.resize_to_parent(): canvas ${ this.canvas.id } resized to ${ this.canvas.width } by ${ this.canvas.height }` )
	}


	protected animate( timestamp: number ): void {

		// Check if we're meant to stop
		if( this.stop_the_animation == true ){
			console.log( `CanvasManager.animate(): stopping animations ready for shutdown.` );
			return;
		}

		// Run animation function if required
		if( this.skip_counter++ >= ( this.every_n_frames - 1 ) ){

			// Calculate delta time
			if( this.previous_timestamp == null ){
				this.previous_timestamp = timestamp;
			}

			var delta_milliseconds = timestamp - this.previous_timestamp;
			this.previous_timestamp = timestamp;

			// Go
			this.animator_func( this, timestamp, delta_milliseconds );


			//console.log( `DREW = ${ this.skip_counter }` )

			// Reset
			this.skip_counter = 0;
			
		}else{
			//console.log( `SKIPPED = ${ this.skip_counter }` )
		}

		// Schedule us again
		window.requestAnimationFrame( ( timestamp ) => this.animate( timestamp ) );

	}	



	public render_text( text: string, x: number, y: number ): void {
		this.context2d.fillStyle = this.text_colour;
		this.context2d.fillText( text, x, y );
	}



	public render_text_underline( text: string, x: number, y: number ): void {
		/*
			Has to be done manually, there is no underlined font capability in canvas
		*/
		// Original text
		this.render_text( text, x, y );

		// Underline
		let metrics: TextMetrics = this.context2d.measureText( text );
		
		switch( this.context2d.textAlign ){
			case "center":
				x -= ( metrics.width / 2 );
				break;

			case "right":
				x -= metrics.width;
				break;
		}

		let colour = this.text_colour;
		let thickness = 1;
	
		y += metrics.actualBoundingBoxDescent;
	
		this.context2d.beginPath();
		this.context2d.strokeStyle = colour;
		this.context2d.lineWidth = thickness;
		this.context2d.moveTo( x, y );
		this.context2d.lineTo( x + metrics.width, y );
		this.context2d.stroke();

	}



	public measure_text_width( text: string ): number {
		/*
			Useful just by itself
		*/

		let metrics: TextMetrics = this.context2d.measureText( text );
		return metrics.width;

	}



	public _generate_rounded_rect_path( x: number, y: number, width: number, height: number, rounded: number ): void {
		/*
			Used by any function needing a rounded rect path for drawing or clipping.
		*/
		const radiansInCircle = 2 * Math.PI;
		const halfRadians = ( 2 * Math.PI ) / 2;
		const quarterRadians = ( 2 * Math.PI ) / 4;
		
		// Start
		this.context2d.beginPath();  

		// top left arc
		this.context2d.arc( rounded + x, rounded + y, rounded, -quarterRadians, halfRadians, true );
		
		// line from top left to bottom left
		this.context2d.lineTo( x, y + height - rounded );
	
		// bottom left arc  
		this.context2d.arc( rounded + x, height - rounded + y, rounded, halfRadians, quarterRadians, true );
		
		// line from bottom left to bottom right
		this.context2d.lineTo( x + width - rounded, y + height );
	
		// bottom right arc
		this.context2d.arc( x + width - rounded, y + height - rounded, rounded, quarterRadians, 0, true );
		
		// line from bottom right to top right
		this.context2d.lineTo( x + width, y + rounded );
	
		// top right arc
		this.context2d.arc( x + width - rounded, y + rounded, rounded, 0, -quarterRadians, true );
		
		// line from top right to top left
		this.context2d.lineTo( x + rounded, y );

		// Done
		this.context2d.closePath(); 

	}


	public render_rounded_rect( x: number, y: number, width: number, height: number, rounded: number, alpha: number ): void {
			
		// Start
		let prev_alpha = this.context2d.globalAlpha;
		this.context2d.globalAlpha = alpha;
		
		// Make path
		this._generate_rounded_rect_path( x, y, width, height, rounded );

		// Go
		this.context2d.stroke(); 

		// Done
		this.context2d.globalAlpha = prev_alpha;

	}


	public clear(): void {
		this.context2d.fillStyle = this.background_colour;
		this.context2d.fillRect( 0, 0, this.context2d.canvas.width, this.context2d.canvas.height );
	}


	/*
	Simple
	*/

	public set_font( font_string: string ): void {
		this.context2d.font = font_string;
		this.context2d.textAlign = "left";
		this.context2d.textBaseline = "top";
	}

	public set_alpha( alpha: number ): void {
		this.context2d.globalAlpha = alpha;
	}

	public set_text_colour( colour_string: string ): void {
		this.text_colour = colour_string;
	}

	public set_background_colour( colour_string: string ): void {
		this.background_colour = colour_string;
	}	

	public get_width(): number {
		return this.canvas.width
	}

	public get_height(): number {
		return this.canvas.height
	}

	public get_canvas(): HTMLCanvasElement {
		return this.canvas
	}

	public get_context2d(): any {
		return this.context2d
	}

}


export {
	CanvasManager
}
