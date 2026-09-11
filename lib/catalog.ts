export type Subcategory={id:string;name:string};
export type Category={id:string;name:string;detail:string;color:string;icon:'Building2'|'Columns3'|'Bath'|'Lamp'|'Box';subcategories:Subcategory[]};
export const categories:Category[] = [
 {id:'arquitectura',name:'Arquitectura',detail:'Espacios, aberturas y mobiliario',color:'lavender',icon:'Building2',subcategories:[{id:'puertas',name:'Puertas'},{id:'ventanas',name:'Ventanas'},{id:'muebles',name:'Muebles'},{id:'sillas',name:'Sillas'},{id:'mesas',name:'Mesas'},{id:'cocinas',name:'Cocinas'},{id:'barandas',name:'Barandas'},{id:'puertas-ventanas',name:'Puertas y ventanas'},{id:'otros',name:'Otros elementos'}]},
 {id:'estructura',name:'Estructuras',detail:'Elementos para construir',color:'mint',icon:'Columns3',subcategories:[{id:'columnas',name:'Columnas'},{id:'vigas',name:'Vigas'},{id:'cimentaciones',name:'Cimentaciones'},{id:'conexiones',name:'Conexiones'},{id:'otros',name:'Otros elementos'}]},
 {id:'sanitarias',name:'Sanitarias',detail:'Aparatos, grifería y accesorios',color:'peach',icon:'Bath',subcategories:[{id:'aparatos',name:'Aparatos sanitarios'},{id:'griferias',name:'Griferías'},{id:'accesorios',name:'Accesorios'},{id:'equipos',name:'Equipos'},{id:'otros',name:'Otros elementos'}]},
 {id:'electricas',name:'Eléctricas',detail:'Luz y conexiones para cada espacio',color:'yellow',icon:'Lamp',subcategories:[{id:'luminarias',name:'Luminarias'},{id:'interruptores',name:'Interruptores'},{id:'tomacorrientes',name:'Tomacorrientes'},{id:'tableros',name:'Tableros'},{id:'equipos',name:'Equipos'},{id:'otros',name:'Otros elementos'}]},
 {id:'genericos',name:'Modelos genéricos',detail:'Complementos para tu proyecto',color:'blue',icon:'Box',subcategories:[{id:'equipamiento',name:'Equipamiento'},{id:'vegetacion',name:'Vegetación'},{id:'personas',name:'Personas'},{id:'vehiculos',name:'Vehículos'},{id:'otros',name:'Otros elementos'}]},
];
export function classification(category:string,subcategory:string){
 if(category==='mobiliario')return {category:'arquitectura',subcategory:subcategory||'muebles'};
 if(category==='puertas-ventanas')return {category:'arquitectura',subcategory:subcategory||'puertas-ventanas'};
 return {category,subcategory:subcategory||'otros'};
}
export type Family={id:string;name:string;category:string;subcategory:string;description:string;revit:number;revision:number;size:number;sha256:string;published:number;updated:number;hasThumbnail:boolean};
export type License={id:string;name:string;email:string;key_suffix:string;status:string;expires:number;max_devices:number;device_count:number;created:number};
export type Device={id:string;license_id:string;name:string;last_seen:number};
export type Release={id:string;version:string;url:string;sha256:string;notes:string;created:number};
