/*
	Debug canvas tool, useful for just dumping stats. All pages get a reference when debug mode is active.
*/

import { CanvasManager } from "./CanvasManager.js"


/**********************************************
	Time Series
*/

class time_series_t{

	series: any[];
	buckets: number;

	/*
		Debugger
	*/

	constructor( buckets: number ){
		this.series = [];
		this.buckets = buckets;
	}


	public add_value( value: any ): void {
		this.series.push( value );
		if( this.series.length > this.buckets ){
			this.series.shift();
		}
	}


	public add_previous_value_again(): void {
		/*
			Used by the graph lines in the DebugCanvas, this is called for a frame when a new data update didn't come, add whatever the mean in.
		*/
		this.add_value( this.get_mean() );
	}


	public increment_head(): void {
		/*
			Used by impulse graph lines, we want to add 1 to the current head (and add it as 1 if there isn't one)
		*/
		if( this.series.length > 0 ){
			this.series[ this.series.length - 1 ]++;
		}else{
			this.series.push( 1 );
		}
	}


	public get_mean(): number {
		return this.series.reduce( ( total, e ) => total + e, 0 ) / this.series.length;
	}


	public get_min(): number {
		return Math.min.apply( null, this.series );
	}


	public get_max(): number {
		return Math.max.apply( null, this.series );
	}

	public get_sd(): number {
		if( this.series.length == 0 ){
			return 0;
		}

		let mean = this.series.reduce( ( total, e ) => total + e, 0 ) / this.series.length;
		let variance = this.series.reduce( ( total, e ) => total + ( ( e - mean ) * ( e - mean ) ), 0 ) / ( this.series.length - 1 );
		let sd = Math.sqrt( variance );

		return sd;
	}


}



/**********************************************
	Debug Lines
*/


interface line_t {
	name: string;

	// This can now be a string, or an array of strings - arrays are prints out one after the other
	string_or_array: string | string[];
	time: number;
	sequence: number;

	tag: string;


	// Data if this is a debug graph, else it's a debug line
	time_series: time_series_t;					// Time series itself
	time_series_fired_this_frame: boolean;		// We use this for data events that are slower than anim time, we punt the last value through again when the frame totaling is done, keeps everything synced.
	is_accumulator: boolean;					// If true we accumulate values over a frame. Cheapo integrator.


	// State for being a clicked on heading
	if_heading_is_hidden: boolean;

	// Parsed suffix codes
	heading_suffix: boolean;
	localaddress_suffix: { port: number, server_url: string };
	localport_suffix: { port: number };
}



/**********************************************
	Debug Canvas
*/

interface hitbox_t{
	height: number;
	line: line_t;
}


declare type debug_line_key_t = string;


class DebugCanvas{
	/*
		Uses named strings so we get consistent updates, renders at full animation speed automatically using canvas utilities.

		There are special formatting suffixes available for formatting - we must use the canvas to render so we don't impact the speed of the rest of the system (we're used for profiling and a load of DOM changes would be bad).
	*/
	canvas_element: HTMLCanvasElement;
	canvas_manager: CanvasManager;

	lines: Record< string, line_t >;
	sequence: number;

	is_render: boolean;
	text_height_pixels: number;
	text_gap_pixels: number;

	// suffix eaters
	heading_suffix: boolean;
	localaddress_suffix: { port: number, server_url: string };
	localport_suffix: { port: number };
	break_regex: RegExp;
	suffix_eaters: Record< string, ( s: string ) => string >;

	
	collision_map: hitbox_t[];					// hit detection for clicks

	// Graph lines
	static c_graph_line_time_series_buckets = 64;

	// Internal
	frame_times: time_series_t;


	constructor( canvas_element_name: string ){

		// Canvas setup
		this.canvas_element = <HTMLCanvasElement>document.getElementById( canvas_element_name );
		this.canvas_manager = new CanvasManager(
			this.canvas_element,
			( canvas_manager, timestamp, delta_milliseconds ) => this.tick( canvas_manager, timestamp, delta_milliseconds ),
			1 );

		// Set initial render state
		this.canvas_manager.set_font( `${ this.text_height_pixels }px courier` );
		this.canvas_manager.set_text_colour( "white" );
		this.canvas_manager.set_background_colour( "black" );

		// Storage
		this.lines = {};
		this.sequence = 0;		// Dicts aren't ordered.

		// Maths
		this.frame_times = new time_series_t( 60 );

		// If we're rendering or not
		this.is_render = true;

		// Set text properties
		this.text_height_pixels = 11;
		this.text_gap_pixels = 2;

		// Setup suffix code eaten system, these result registers need resetting each add_debug_line
		this.heading_suffix = false;
		this.localaddress_suffix = null;
		this.localport_suffix = null;

		this.break_regex = /:([^:]+)/g;

		this.suffix_eaters = {
			
			':heading': ( s: string ): string => {
				this.heading_suffix = true;

				// Remove entire suffix code
				return s.replace( ':heading', '' );
			},

			':localaddress': ( s: string ): string => {
				let regex = new RegExp( this.break_regex );
				let matches: string[] = [];

				// Start from first occurrence of suffix code (to avoid other : in string)
				let sliced = s.slice( s.indexOf( ':localport' ) );
				let match = regex.exec( sliced );

				let count = 0;
				while( match != null ){
					let group = match[ 1 ];		// Capture group is index 1 (no : at start)
					matches.push( group );

					// NOTE: Would pull in all remaining suffix codes so limit count
					if( ++count > 2 ){
						break;
					}

					match = regex.exec( sliced );	// Next
				}

				if( matches.length != 3 ){
					throw( `DebugCanvas.add_debug_line(): bad :localaddress with string: '${ s }', matches: ${ matches.length }` );
				}

				let port: string = matches[ 1 ];
				let server_url: string = matches[ 2 ];

				this.localaddress_suffix = {
					port: parseInt( port ),
					server_url: server_url
				}

				// Debug
				console.log( `DebugCanvas.localaddress(): parsed matches: ${ matches }` );

				// Remove first occurrence of entire suffix code from original string
				return s.replace( `:localaddress:${ port }:${ server_url }`, '' );
			},

			':localport': ( s: string ): string => {
				let regex = new RegExp( this.break_regex );
				let matches: string[] = [];

				// Start from first occurrence of suffix code (to avoid other : in string)
				let sliced = s.slice( s.indexOf( ':localport' ) );
				let match = regex.exec( sliced );				

				let count = 0;
				while( match != null ){
					let group = match[ 1 ];		// Capture group is index 1 (no : at start)
					matches.push( group );

					// NOTE: Would pull in all remaining suffix codes so limit count
					if( ++count > 1 ){
						break;
					}

					match = regex.exec( sliced );	// Next
				}

				if( matches.length != 2 ){
					throw( `DebugCanvas.add_debug_line(): bad :localport with string: '${ s }', matches: ${ matches.length }` );
				}

				let port: string = matches[ 1 ];

				this.localport_suffix = {
					port: parseInt( port )
				}

				// Debug
				console.log( `DebugCanvas.localport(): parsed matches: ${ matches }` );

				// Remove first occurrence of entire suffix code from original string
				return s.replace( `:localport:${ port }`, '' );
			}
		}

		// Setup hit detection
		this.collision_map = [];

		// Setup click handler
		this.canvas_element.onclick = ( event: MouseEvent ) => {
			this.on_clicked( event.offsetX, event.offsetY );
		}

		// Go, start drawing what we have
		this.canvas_manager.start_animating();		
	}


	set_active( active: boolean ): void {
		this.is_render = active;
	}


	toggle_active(): void {
		this.is_render = !this.is_render;

		console.log( `DebugCanvas.toggle_active(): status is ${ this.is_render }` );
	}


	resize(): void {
		/*
			Call when the canvas size might have changed, we need to reload it.
		*/
		this.canvas_manager.resize_to_parent();

	}


	public on_clicked( relative_x_pixels: number, relative_y_pixels: number ): void {
		/*
			Use the collision map to see if we hit a special entry with a parsed localport or localaddress, if so, open a new browser tab with the link we synthesise from that.

			Used for links to code profilers etc.
		*/

		//console.log( `CLICKED: ${ relative_x_pixels }, ${ relative_y_pixels }` );

		// Same as this.tick()
		let ypos: number = this.text_height_pixels;

		for( let entry of this.collision_map  ){

			ypos += entry.height;
			
			// Check if it's inside this (can't be a previous entry)
			if( ypos > relative_y_pixels ){

				if( entry.line.localaddress_suffix != null ){

					let port = entry.line.localaddress_suffix.port;
					let server_url = entry.line.localaddress_suffix.server_url;

					window.open( `http://${ location.hostname }:${ port }/${ server_url }`, '_blank' );

				}else if( entry.line.localport_suffix != null ){

					let port = entry.line.localport_suffix.port;

					window.open( `http://${ location.hostname }:${ port }`, '_blank' );

				}else if( entry.line.heading_suffix == true ){

					entry.line.if_heading_is_hidden = !entry.line.if_heading_is_hidden;

				}

				// We're done, we got a hit.
				return;

			}

		}
	}

	
	public add_debug_line( tag: string, name: string, string_or_array: string | string[] ): void {
		/*
			NOTE: Tag doesn't have to be unique, it's used to mass remove existing debug lines.

			We just want to know the data and time it was stored. We overwrite existing.

			:heading

			- marks this as a coloured heading.

			:localaddress:<port decimal>:<post server url>

			- resolves to http://<the server>:<port decimal>/<post server url> 

			:localport:<port decimal> 

			- resolves to http://<the server>:<port decimal>
		*/

		// Look for suffixes in the string, must be fast when there are *no* suffixes as will be the case for most dynamic data. Strings with suffix codes are unlikely to be updated in real time (warnings etc)
		this.heading_suffix = false;
		this.localaddress_suffix = null;
		this.localport_suffix = null;

		// Go - check we've actually got anything to work with!
		if( !( string_or_array instanceof Array ) ){

			if( string_or_array != undefined && string_or_array != null && ( string_or_array.indexOf( ':' ) != -1 ) ){

				let match: boolean;
				do{

					match = false;
					for( let suffix in this.suffix_eaters ){

						// If it matches, eat the suffix and store data.
						if( string_or_array.indexOf( suffix ) != -1 ){
							string_or_array = this.suffix_eaters[ suffix ]( string_or_array );
							match = true;
						}

					}

				}while( match == true );

			}

		}

		// Generate the lookup key, we want to be able to use the same name in multiple sections
		let key: string = `${ tag }:${ name }`;

		// Up the sequence if this is a new name.
		if( key in this.lines ){

			// Update it - don't generate a new structure, we have mappings to it elsewhere
			this.lines[ key ].string_or_array = string_or_array;
			this.lines[ key ].time = Date.now();
			 
		 }else{

			// Add it - set all new lines to hidden so if they're a heading they're closed
			this.lines[ key ] = { 
				name: name,
				string_or_array: string_or_array,
				time: Date.now(),
				sequence: this.sequence++,
				tag: tag,

				time_series: null,
				time_series_fired_this_frame: false,
				is_accumulator: false,

				if_heading_is_hidden: true,

				heading_suffix: this.heading_suffix,
				localaddress_suffix: this.localaddress_suffix,
				localport_suffix: this.localport_suffix
			};

		 }

	}


	public add_graph_line( tag: string, name: string, value: number, is_accumulator?: boolean ): void {
		/*
			This is designed for realtime statistics, as our old timeseries systems used to do. This does not interpret any of the system suffixes, you must use a debug line for that.

			NOTE: if is_impulse is true, then this call is treated as an event firing, this has consequences for collation and rendering. Use this if you call this every time a tweet comes in multiple times a frame etc, the value is ignores, the impulse is all that's important.

			NOTE: This will never be a heading or use any of the suffixes, never parsed for graph lines.
		*/

		let key: string = `${ tag }:${ name }`;

		// Normalise
		if( is_accumulator != true ){
			is_accumulator = false;		// from undefined
		}

		// Up the sequence if this is a new name.
		if( key in this.lines ){

			// Update it, if this was not previously a graph line, throw
			if( this.lines[ key ].time_series == null ){

				throw( `DebugCanvas.add_graph_line(): no time_series exists on ${ tag }:${ name }, this was previously set up as a debug line.` );

			}

			// If it was previously an accumulator and now isn't, throw
			if( this.lines[ key ].is_accumulator != is_accumulator ){

				throw( `DebugCanvas.add_graph_line(): ${ tag }:${ name } previous is_accumlator was ${ this.lines[ key ].is_accumulator }, now ${ is_accumulator }.` );

			}

			// Update time_series
			if( is_accumulator == false ){

				// Store a new value
				this.lines[ key ].time_series.add_value( value );

			}else{

				// It's an impulse, tell the time series to increment the current head
				this.lines[ key ].time_series.increment_head();

			}

			// Store
			this.lines[ key ] = { 
				name: name,
				string_or_array: "",
				time: Date.now(),
				sequence: this.lines[ key ].sequence,
				tag: tag,

				time_series: this.lines[ key ].time_series,
				time_series_fired_this_frame: true,
				is_accumulator: is_accumulator,

				if_heading_is_hidden: false,

				heading_suffix: null,
				localaddress_suffix: null,
				localport_suffix: null
			};
			 
		 }else{

			// Add it and a new time series
			let time_series = new time_series_t( DebugCanvas.c_graph_line_time_series_buckets );

			// Setup time_series
			if( is_accumulator == undefined ){

				// Store a new value
				time_series.add_value( value );

			}else{

				// It's an impulse, tell the time series to initialise a new head
				time_series.increment_head();

			}

			// Store
			this.lines[ key ] = { 
				name: name,
				string_or_array: "",
				time: Date.now(),
				sequence: this.sequence++,
				tag: tag,

				time_series: time_series,
				time_series_fired_this_frame: true,
				is_accumulator: is_accumulator,

				if_heading_is_hidden: false,

				heading_suffix: null,
				localaddress_suffix: null,
				localport_suffix: null
			};

		 }

	}


	public remove_debug_lines_by_tag( tag: string ): void {
		/*
			Scrub a tag.
		*/

		for( let line in this.lines ){

			if( this.lines[ line ].tag == tag ){
				delete this.lines[ line ];
			}

		}
	}


	tick( canvas_manager: CanvasManager, timestamp: number, delta_milliseconds: number ): void {
		/*
			Draw all lines in order, "name: data", with colour coding depending on update time.

			Also make collision mask that allows the user to click on entries that are links.

			NOTE: remember we have two different kinds of lines, debug and graph, though graph is more visual it's actually simpler as it only ever does one thing.
		*/
		interface line_output_t {
			alpha: number;
			string: string;
			line: line_t;

		}

		const c_left_x_pixels = 10;		// x coord of each line start

		if( !this.is_render ){
			return;
		}

		// Frame time update
		this.frame_times.add_value( delta_milliseconds );

		// Mean frame time
		let frame_time_ms = this.frame_times.get_mean();

		let output: line_output_t[] = [];
		let time: number = Date.now();

		// Store in array, remember we have debug lines, and graph lines
		for( let entry in this.lines ){

			// If this is a graph line, check if its been updated this frame - if not, push its previous value to the time series. Set the "not updated" flag again.
			let printable_name: string = "";
			if( this.lines[ entry ].time_series != null ){

				// Send the identifier as the name, the render code adds stats, it's a graph line (string is always empty)
				printable_name = `${ this.lines[ entry ].name }:`;

				// Accumulator & missing value checks
				if( this.lines[ entry ].is_accumulator == true ){

					// Accumulator, no matter what happens we set a new bucket as zero
					this.lines[ entry ].time_series.add_value( 0.0 );

				}else{

					// Update the time series with the previous value if there was a value missing this frame
					if( this.lines[ entry ].time_series_fired_this_frame == false ){
						this.lines[ entry ].time_series.add_previous_value_again();
					}

				}

				// Reset fire check
				this.lines[ entry ].time_series_fired_this_frame = false; 

			}else{

				// Send the identifier and value as the string to render, it's a debug line, unless it's an array debug line in which case just drop the name here
				if( this.lines[ entry ].string_or_array instanceof Array ){

					// It's an array, just put the name here
					printable_name = `${ this.lines[ entry ].name }: `;

				}else{

					// It's just a string, if it's a heading, the name is all we want, else the name:value
					printable_name = (
						this.lines[ entry ].heading_suffix == true ? 
							`${ this.lines[ entry ].name }` : 
							`${ this.lines[ entry ].name }: ${ this.lines[ entry ].string_or_array }` 
					);

				}

			}

			// Grab relevant data
			output.push(
				{
					alpha: Math.max(
								( ( time - this.lines[ entry ].time ) / 1000.0 ),
								1.0
							),

					// Just use the name if this is a heading, ignore the value string
					string: printable_name,

					// Original line
					line: this.lines[ entry ]

				}
			);

		}


		// Push an FPS graphline with a -1 sequence to the list
		output.push(
			{
				alpha: 1.0,
				string: "FrameTime:",
				line: {
					// Patch anything here
					sequence: -1,
					tag: "A",
					time_series: this.frame_times,
					is_accumulator: false,
					heading_suffix: false,
					localaddress_suffix: null,
					localport_suffix: null,
					if_heading_is_hidden: false,
					name: "n/a",
					string_or_array: "n/a",
					time: 0,
					time_series_fired_this_frame: false
				}
			}
		)


		// Sort by tag, then sequence
		let sorted = output.sort(
			( a, b ) => {
				// Sort tag first
				if( a.line.tag > b.line.tag ){
					return 1;
				}
				if( a.line.tag < b.line.tag ){
					return -1
				}
				// Sort headings top of tag
				if( a.line.heading_suffix && !b.line.heading_suffix ){
					return -1;
				}
				if( !a.line.heading_suffix && b.line.heading_suffix ){
					return 1;
				}
				if( a.line.sequence > b.line.sequence ){
					return 1;
				}
				if( a.line.sequence < b.line.sequence ){
					return -1;
				}
				return 0;
			}
		 );


		// Print in turn
		this.canvas_manager.clear();

		// Start y (must be consistent with hit tests in on_clicked)
		let ypos: number = this.text_height_pixels;

		// Collision map
		this.collision_map = [];

		// Handling expanded/hidden sections under headings
		let previous_heading: line_t = null; 

		for( let item of sorted ){

			// Needed for collision map zone calc
			let prev_ypos: number = ypos;

			// Handle any pre-skip
			let line_skip_pixels = this.text_height_pixels + this.text_gap_pixels;

			// Check if we're a heading, and if we're expanded or not
			let is_this_line_hidden: boolean = false;
			if( item.line.heading_suffix == true ){
				previous_heading = item.line;
			}
			if( previous_heading != null ){

				// If this isn't the heading (always displayed), skip if heading is in hidden mode
				if( previous_heading != item.line ){
					if( previous_heading.if_heading_is_hidden == true ){
						is_this_line_hidden = true;
					}
				}
			}

			// Check if we're drawing
			if( is_this_line_hidden == false ){

				// Check whether we're doing a simple graph line, or a more complex debug line
				if( item.line.time_series != null ){

					// We're a graph line - we shouldn't have to do anything to deal with us being fired with impulses rather than values, the add_graph_line/time_series code gives us a frame wise basis
					let ts: time_series_t = item.line.time_series;

					let mean: string;
					if( item.line.is_accumulator == true ){

						// We want the mean scaled to per second as we're counting per frame each bucket
						mean = ( ts.get_mean() / ( frame_time_ms / 1000.0 ) ).toFixed( 2 );

					}else{

						mean = ts.get_mean().toFixed( 2 );

					}
					let sd = ts.get_sd().toFixed( 2 );
					let min = ts.get_min().toFixed( 2 );
					let max = ts.get_max().toFixed( 2 );

					// Set the font
					this.canvas_manager.set_text_colour( "lightgreen" );
					this.canvas_manager.set_font( `${ this.text_height_pixels }px courier` );

					// Render text
					this.canvas_manager.render_text( `${ item.string } av»${ mean } sd»${ sd } mn»${ min } mx»${ max }`, c_left_x_pixels, ypos );

					// We want to render the graph at the RHS of the text as strokes



				}else{

					let do_bold: boolean = false;
					let skip_line: boolean = false;
					let colour: string = "white";
					let underline: boolean = false;
					let text: string = item.string;		// So we can non-destructively modify it

					// Check entry type
					if( item.line.heading_suffix == true ){
						skip_line = true;
						do_bold = true;
						colour = "red";

						// Modify string with [-], [+] depending on state
						if( item.line.if_heading_is_hidden == true ){
							text = `[+]${ text }`;
						}else{
							text = `[-]${ text }`;
						}
					}

					if( item.line.localaddress_suffix != null ){
						colour = "lightblue";
						underline = true;
					}

					if( item.line.localport_suffix != null ){
						colour = "lightblue";
						underline = true;
					}

					// Set the font
					this.canvas_manager.set_text_colour( colour );
					let bold: string = ( do_bold == true ) ? "bold" : "";
					this.canvas_manager.set_font( `${ bold } ${ this.text_height_pixels }px courier` )

					if( skip_line == true ){
						ypos += line_skip_pixels;
					}

					// Render what'll be the normal name / value (even for an array)
					if( underline == true ){

						this.canvas_manager.render_text_underline( text, c_left_x_pixels, ypos );

					}else{

						this.canvas_manager.render_text( text, c_left_x_pixels, ypos );

					}

					// If this is an array, we now print out all the array values
					if( item.line.string_or_array instanceof Array ){

						// Get the x where the above text would have printed
						let xpos = c_left_x_pixels + this.canvas_manager.measure_text_width( text );

						// Run the array aligned on the rhs of the array name
						for( let line of item.line.string_or_array ){

							this.canvas_manager.render_text( line, xpos, ypos );
							ypos += line_skip_pixels;

						}

					}

					// Handle post skip, slightly less than the pre-skip
					if( skip_line == true ){
						ypos += line_skip_pixels / 2;
					}

				}

				// Move to start of next string
				ypos += line_skip_pixels;

				// Collision map
				this.collision_map.push(
					{ 
						height: ypos - prev_ypos,
						line: item.line
					}
				)

			} // End of hidden line check
	
			// Next
		}


	}


}

export {
	DebugCanvas
}