/*
	WebGL terrain demo components and renderer. Controlling Demo File.
*/

import * as THREE from './three.js';
import { OrbitControls } from './OrbitControls.js'
import { FirstPersonControls  } from './FirstPersonControls.js';
import { DebugCanvas } from './DebugCanvas.js';
import { 
	generate_empty_2d_array,
	vis_show,
	vis_toggle,
} from './Utilities.js';
import { PerlinTerrain } from './PerlinTerrain.js';
import { LandScape } from './LandScape.js';

 
/*
	Types 
*/

import Object3D = THREE.Object3D;
import Vector4 = THREE.Vector4;
import Vector3 = THREE.Vector3;
import Vector2 = THREE.Vector2;
import Box3 = THREE.Box3;
import Box2 = THREE.Box2;
import Matrix4 = THREE.Matrix4;
import Matrix3 = THREE.Matrix3;
import Plane = THREE.Plane;
import Sphere = THREE.Sphere;


//************************************************************

class Scene {
	/*
		Bring up three, manage render loop & interaction
	*/

	protected scene_container: HTMLElement = null;
	protected scene: THREE.Scene = null;
	protected renderer: THREE.WebGLRenderer = null;
	protected camera: THREE.PerspectiveCamera = null;
	protected raycaster: THREE.Raycaster = null;

	// Animation
	protected previous_timestamp: number = null;

	// Calculation space
	protected source_perlin: PerlinTerrain = null;

	// Interpolated space
	protected perlin: PerlinTerrain = null;

	// Size we do the noise calculation at
	readonly c_perlin_generation_width: number = 256;
	readonly c_perlin_generation_height: number = 256;

	// Size of our map
	readonly c_perlin_width: number = 1024;
	readonly c_perlin_height: number = 1024;

	// Controller
	protected orbit_controls: OrbitControls = null;
	protected first_person_controls: FirstPersonControls = null;

	// Lighting
	protected point_light: THREE.PointLight = null;
	protected light_sphere: THREE.SphereGeometry = null;
	protected light_sphere_mesh: THREE.Mesh = null;

	// Geometry
	protected debug_plane: THREE.PlaneGeometry = null;
	protected debug_mesh: THREE.Mesh = null;

	// LOD Landscape
	protected landscape: LandScape = null;
	protected previous_dynamic_meshes: THREE.Mesh[] = null;

	// Debug
	protected debug_canvas_on: boolean;
	protected debug_canvas: DebugCanvas;

	// Constants
	protected c_perlin_size = new Vector3( 1000.0, 25.0, 1000.0 );
	protected c_perlin_origin = new Vector3( 0, 0, 0 );
	protected c_perlin_lod_origin = new Vector3( 0, 0, 0 );
	protected c_landscape_x_splits = 32;
	protected c_landscape_y_splits = 32;
	protected c_landscape_lod_levels = 8;

	// Operations
	protected paused: boolean = false;


	constructor(

	){
		// Debug systems
		this._setup_debug_canvas();

		// 3D systems
		this._start_three();
		this._build_terrain_data();
		this._build_landscape();
		this._build_scene();
		this._add_obects_to_scene();

	}


	/*
		Debug Handling
	*/

	public _setup_debug_canvas(): void {

		// Setup the canvas
		this.debug_canvas_on = false;
		this.debug_canvas = new DebugCanvas( "debug_canvas_canvas" );
		this.debug_canvas.set_active( false );

		// Show the debug button
		vis_show( "debug_landing_root" );

		let button = document.getElementById( "debug_landing_button" );

		button.onclick = () => {
			this._toggle_debug_canvas();
		}

		// Setup the standard lines we use
		this.debug_canvas.add_debug_line( "SCENE", "Scene", ":heading" );
		this.debug_canvas.add_debug_line( "SCENE", "Light Position", "" );

	}


	public _toggle_debug_canvas(): void {

		// Turn on via function or keypress.
		this.debug_canvas.toggle_active();

		// Show or hide the debug canvas
		vis_toggle( "debug_canvas_container" );

	}	



	/*
		Scene Initialisers
	*/

	protected _start_three(): void {

		// Three
		this.scene_container = document.getElementById( 'scene_container' );
		this.scene_container.innerHTML = '';

		this.renderer = new THREE.WebGLRenderer( { antialias: true } );
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.scene_container.appendChild( this.renderer.domElement );

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color( 0xbfd1e5 );

		this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 10, 20000 );
		this.camera.position.set( 500, 500, 500 );

		// Utils
		this.raycaster = new THREE.Raycaster();

		// Controller
		this.orbit_controls = new OrbitControls( this.camera, this.renderer.domElement );
		this.orbit_controls.minDistance = 100;
		this.orbit_controls.maxDistance = 10000;
		this.orbit_controls.maxPolarAngle = Math.PI / 2;
		this.orbit_controls.target.set( 500, 0, 500 );

		// @ts-ignore
		//this.first_person_controls = new FirstPersonControls( this.camera, this.renderer.domElement );
		//this.first_person_controls.movementSpeed = 150;
		//this.first_person_controls.lookSpeed = 0.1;
		//this.first_person_controls.lookAt( 0, 0, 0 );

		// Events
		this.scene_container.addEventListener( 'pointermove', ( event: MouseEvent ) => this.on_pointer_move( event ) );
		window.addEventListener( 'resize', () => this.on_resize() );
		document.addEventListener("visibilitychange", () => this.on_document_hidden() );

		// Done
		console.debug( `Scene._start_three(): done.` );

	}


	protected _build_terrain_data(): void {
		
		// Build out a smaller perlin terrain for performance reasons
		this.source_perlin = new PerlinTerrain(
			this.c_perlin_generation_width,
			this.c_perlin_generation_height
		);
		this.source_perlin.generate_perlin_height_map();

		// Sample to the size we want
		this.perlin = new PerlinTerrain(
			this.c_perlin_width,
			this.c_perlin_height
		);
		this.perlin.interpolate_from_terrain( this.source_perlin );

		// Store to debug so we can render it straight away
		let size = this.c_perlin_size;
		let origin = this.c_perlin_origin;
		this.debug_plane = this.perlin.generate_plane_geometry( size, origin );
		this.debug_mesh = this.geometry_to_mesh( this.debug_plane, new THREE.MeshLambertMaterial( { color: 0x00ff55, wireframe: true } ) );
		this.debug_mesh.receiveShadow = true;
		this.debug_mesh.castShadow = true;

		// Done
		console.debug( `Scene._build_terrain_data(): done.` );
	}


	protected _build_landscape(): void {
		/*
			Build out the landscape data we'll use for lod rendering
		*/
		this.landscape = new LandScape(
			this.c_landscape_x_splits,
			this.c_landscape_y_splits,
			this.perlin,
			this.c_landscape_lod_levels,
			this.c_perlin_size,
			this.c_perlin_lod_origin,
			new THREE.MeshLambertMaterial( { color: 0xff0055, wireframe: true } )
		)

		// Done
		console.debug( `Scene._build_landscape(): done.` );
	}


	protected _build_scene(): void {
		/*
			Add objects after data is build and three is setup.
		*/ 

		// Lights
		let light_position = new Vector3( 10, 1000, 10 ); 
		this.point_light = new THREE.PointLight( 0xffdd00, 1.0, 0, 2 );
		// @ts-ignore
		this.point_light.position.set( light_position.x, light_position.y, light_position.z );
		this.point_light.castShadow = true;

		// Set up shadow properties for the light
		this.point_light.shadow.mapSize.width = 512;
		this.point_light.shadow.mapSize.height = 512;
		this.point_light.shadow.camera.near = 0.5;
		this.point_light.shadow.camera.far = 500;
		
		// Light representation
		this.light_sphere = new THREE.SphereGeometry( 10.0, 20, 20 );
		this.light_sphere_mesh = this.geometry_to_mesh( this.light_sphere, new THREE.MeshBasicMaterial( { color: 0xffdd00 } ) );
		// @ts-ignore
		this.light_sphere_mesh.position.set( light_position.x, light_position.y, light_position.z );
		this.light_sphere_mesh.receiveShadow = false;
		this.light_sphere_mesh.castShadow = false;
		

		// Done
		console.debug( `Scene._build_scene(): done.` );

	}


	protected _add_obects_to_scene(): void {
		/*
		*/

		// Just put debug plane in for now, we'll be custom rendering the lod plane later
		//this.scene.add( this.debug_mesh );

		// Lighting
		this.scene.add( this.point_light ); 
		this.scene.add( this.light_sphere_mesh );

		// Single lod level of the lod mesh
		//let meshes = this.landscape.get_meshes_for_lod_level( 3 );
		//meshes.map( e => this.scene.add( e ) );

		// Simple lerp of a particular factor level, non-dynamic
		/*
		let factors: number[][] = generate_empty_2d_array( this.c_landscape_x_splits + 1, this.c_landscape_y_splits + 1 );

		for( let y = 0; y <= this.c_landscape_y_splits; y++ ){
			for( let x = 0; x <= this.c_landscape_x_splits; x++ ){
				factors[ y ][ x ] = Math.sin( ( x / this.c_landscape_x_splits ) * Math.PI / 2 ) * 2.0 +
									Math.cos( ( y / this.c_landscape_y_splits ) * Math.PI / 2 ) * 2.0
			}
		}

		let meshes = this.landscape.demo_shader_render_with_factors( factors );
		meshes.map( e => this.scene.add( e ) );
		*/

		// Done
		console.debug( `Scene._add_obects_to_scene(): done.` );
	}



	/*
		Utilities
	*/ 

	public geometry_to_mesh( geometry: THREE.BufferGeometry, material: THREE.Material ): THREE.Mesh {
		return new THREE.Mesh( geometry, <THREE.MeshBasicMaterial>material );
	}


	public cumulative_rotate_object_around_point( object: Object3D, point: Vector3, rotations: Vector3 ): void {
		/*
			Rotate an object about an anchor point, if run multiple times the rotation continues.
		*/
		// @ts-ignore
		let direction: Vector3 = new Vector3( 
			// @ts-ignore
			point.x - object.position.x,
			// @ts-ignore
			point.y - object.position.y,
			// @ts-ignore
			point.z - object.position.z
		);
		direction.normalize();

		// @ts-ignore
		let mag = object.position.distanceTo( point );
		object.translateOnAxis( direction, mag );

		object.rotateX( rotations.x );
		object.rotateY( rotations.y );
		object.rotateZ( rotations.z );

		direction.multiplyScalar( -1.0 );
		object.translateOnAxis( direction, mag );

	}



	/*
		Controls
	*/

	public start_animating(): void {
		/*
			Call externally to start animations
		*/
		window.requestAnimationFrame( ( timestamp ) => this._do_animation( timestamp ) );
	}



	/*
		Animation
	*/

	protected _do_animation( timestamp: number ): void {
		/*
			Simple repeated rendering, no pausing for now
		*/

		// Calculate delta time 
		if( this.previous_timestamp == null ){
			this.previous_timestamp = timestamp;
		}

		let delta_milliseconds = timestamp - this.previous_timestamp;

		if( this.paused ){
			
		}else{

			// Run render function
			this._do_render( delta_milliseconds, timestamp );

		}

		this.previous_timestamp = timestamp;

		// Schedule us again
		window.requestAnimationFrame( ( timestamp ) => this._do_animation( timestamp ) );

	}	



	/*
		Rendering
	*/


	protected _calculate_factor_array_for_t( timestamp_milliseconds: number ): number[][] {
		/*
			We'd normally generate the blending factors for the lod landscape depending on distance from the camera, in this case we move them around in a nice way to make program function obvious.
		*/
		
		let factors: number[][] = generate_empty_2d_array( this.c_landscape_x_splits + 1, this.c_landscape_y_splits + 1 );

		let t = ( timestamp_milliseconds / 1000.0 ) * ( Math.PI / 2.0 ) * 0.25; 

		for( let y = 0; y <= this.c_landscape_y_splits; y++ ){
			for( let x = 0; x <= this.c_landscape_x_splits; x++ ){
				let f = Math.sin( ( ( x / this.c_landscape_x_splits ) + t ) * Math.PI / 2 ) * 2.0 +
									Math.cos( ( ( y / this.c_landscape_y_splits ) + t ) * Math.PI / 2 ) * 2.0

				f = Math.max( f, 0 );
				f = Math.min( f, 8 );
				factors[ y ][ x ] = f;
			}
		}

		return factors;
	}


	protected _do_render( delta_milliseconds: number, timestamp_milliseconds: number ): void {
		/*
			Render a frame, handle dynamic terrain lod here for the demo.
		*/

		// Controls
		if( this.first_person_controls != null ){
			this.first_person_controls.update( delta_milliseconds / 1000.0 );
		}
		if( this.orbit_controls != null ){
			this.orbit_controls.update();
		}

		// Recalculate landscape with new factors
		let factors = this._calculate_factor_array_for_t( timestamp_milliseconds );

		// Remove previous landscape sections
		if( this.previous_dynamic_meshes != null ){
			this.previous_dynamic_meshes.map( e => this.scene.remove( e ) );
		}

		// Add new dynamic landscape seconds, store for removal next frame
		this.previous_dynamic_meshes = this.landscape.demo_shader_render_careful_uniforms( factors );
		this.previous_dynamic_meshes.map( e => this.scene.add( e ) );

		// Rotate point light source and impostor
		let factor: number = Math.PI / ( 1000.0 * 10.0 ) * delta_milliseconds;
		let rotation_amount: Vector3 = new Vector3( factor, factor, factor );
		let anchor: Vector3 = new Vector3( 0, 0, 0 );
		this.cumulative_rotate_object_around_point( this.point_light, anchor, rotation_amount );
		// @ts-ignore
		this.light_sphere_mesh.position.set( this.point_light.position.x, this.point_light.position.y, this.point_light.position.z );

		// Render what we have
		this.renderer.render( this.scene, this.camera );

		// Handle debug lines
		// @ts-ignore
		this.debug_canvas.add_debug_line( "SCENE", "Light Position", `${ this.point_light.position.x.toFixed( 2 ) }, ${ this.point_light.position.y.toFixed( 2 ) }, ${ this.point_light.position.z.toFixed( 2 ) }` );

	}



	/*
		Event handlers
	*/

	public on_resize(): void {
		/*
			Reset anything screen space dependent
		*/

		// Debug canvas
		this.debug_canvas.resize();

		// Controller
		if( this.first_person_controls != null ){
			this.first_person_controls.handleResize();
		}

		// 3D
		this.camera.aspect = window.innerWidth / window.innerHeight;
		this.camera.updateProjectionMatrix();

		this.renderer.setSize( window.innerWidth, window.innerHeight );

	}


	public on_pointer_move( event: MouseEvent ): void {

		if( this.renderer != null ){
			let pointer = new Vector2();
			pointer.x = ( event.clientX / this.renderer.domElement.clientWidth ) * 2 - 1;
			pointer.y = - ( event.clientY / this.renderer.domElement.clientHeight ) * 2 + 1;
			this.raycaster.setFromCamera( pointer, this.camera );
		}

	}


	public on_document_hidden(): void {
		this.paused = document.hidden;
	}

}



//************************************************************

export {
	Scene
}