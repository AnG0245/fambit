using System;
using System.Collections.Generic;
using System.Linq;
using Autodesk.Revit.DB;
using Autodesk.Revit.UI;
namespace NubeBIM {
 public sealed class ProjectTarget {
  internal Document Document{get;}
  public int Year{get;}
  public string Title{get;}
  internal ProjectTarget(Document document,int year){Document=document;Year=year;Title=document.Title;}
 }
 public sealed class PlacementResult {
  public string Message{get;set;}="";
  public bool PlacementRequested{get;set;}
 }
 public sealed class FamilyPlacement {
  private sealed class LoadedFamily {public Document Document=null!;public string RepositoryId="";public ElementId FamilyId=null!;}
  private readonly List<LoadedFamily> _loaded=new List<LoadedFamily>();
  public static ProjectTarget Capture(UIApplication app){
   var doc=app.ActiveUIDocument?.Document;
   if(doc==null||!doc.IsValidObject||doc.IsFamilyDocument)throw new InvalidOperationException("Abre una vista de tu proyecto .rvt para colocar la familia.");
   if(doc.IsReadOnly||doc.IsModifiable)throw new InvalidOperationException("Finaliza la edición actual y verifica que el proyecto permita cambios.");
   return new ProjectTarget(doc,int.Parse(app.Application.VersionNumber));
  }
  public PlacementResult LoadAndPlace(UIApplication app,ProjectTarget target,string path,string repositoryId){
   var doc=target.Document;var ui=app.ActiveUIDocument;
   if(!doc.IsValidObject)throw new InvalidOperationException("El proyecto «"+target.Title+"» se cerró. Activa el proyecto de destino y elige la familia de nuevo.");
   if(ui==null||!ui.Document.IsValidObject||ui.Document.IsFamilyDocument||!ui.Document.Equals(doc))throw new InvalidOperationException("Cambiaste de proyecto durante la descarga. Activa el proyecto donde quieres colocarla y vuelve a elegir la familia.");
   if(doc.IsReadOnly||doc.IsModifiable)throw new InvalidOperationException("El proyecto está ocupado o no permite cambios. Finaliza la operación actual y vuelve a intentarlo.");
   _loaded.RemoveAll(item=>!item.Document.IsValidObject);
   var known=_loaded.FirstOrDefault(item=>item.Document.Equals(doc)&&item.RepositoryId==repositoryId);
   Family? family=known==null?null:doc.GetElement(known.FamilyId) as Family;
   bool reused=family!=null;
   if(family==null){
    using(var transaction=new Transaction(doc,"FAMBIT · Cargar familia")){
     transaction.Start();
     if(doc.LoadFamily(path,new PreserveExisting(),out var loaded)){
      if(transaction.Commit()!=TransactionStatus.Committed)throw new InvalidOperationException("Revit no pudo confirmar la carga de la familia.");
      family=loaded;
     }else transaction.RollBack();
    }
    if(family==null){
     // Resolve the native family name, which may differ from the catalog display name.
     Document? source=null;string familyName;
     try{source=app.Application.OpenDocumentFile(path);if(!source.IsFamilyDocument)throw new InvalidOperationException("El archivo no es una familia Revit.");familyName=source.OwnerFamily.Name;}
     finally{if(source!=null&&source.IsValidObject)source.Close(false);}
     family=new FilteredElementCollector(doc).OfClass(typeof(Family)).Cast<Family>().FirstOrDefault(item=>item.Name==familyName);
     reused=family!=null;
    }
    if(family==null)throw new InvalidOperationException("Revit no pudo cargar esta familia. Comprueba su versión y que el archivo RFA abra correctamente.");
    if(known!=null)_loaded.Remove(known);
    _loaded.Add(new LoadedFamily{Document=doc,RepositoryId=repositoryId,FamilyId=family.Id});
   }
   var symbol=family.GetFamilySymbolIds().Select(id=>doc.GetElement(id) as FamilySymbol).Where(item=>item!=null).OrderBy(item=>item!.Name,StringComparer.CurrentCultureIgnoreCase).FirstOrDefault();
   if(symbol==null)return new PlacementResult{Message="«"+family.Name+"» está en el proyecto, pero no tiene tipos disponibles para colocar."};
   try{
    if(!symbol.IsActive){using(var transaction=new Transaction(doc,"FAMBIT · Activar tipo")){transaction.Start();symbol.Activate();doc.Regenerate();if(transaction.Commit()!=TransactionStatus.Committed)throw new InvalidOperationException("No se pudo activar el tipo de familia.");}}
    // Revit starts its own placement command after this ExternalEvent returns, outside our transaction.
    ui.PostRequestForElementTypePlacement(symbol);
    return new PlacementResult{PlacementRequested=true,Message=(reused?"Tipo existente: ":"Lista para colocar: ")+family.Name+" · "+symbol.Name+". Haz clic en la vista o en el anfitrión que corresponda. Esc termina la colocación."};
   }catch(Exception ex){return new PlacementResult{Message="«"+family.Name+"» quedó cargada. Revit no pudo iniciar la colocación en esta vista: "+ex.Message+" Abre una vista compatible y vuelve a elegirla."};}
  }
  private sealed class PreserveExisting:IFamilyLoadOptions {
   public bool OnFamilyFound(bool familyInUse,out bool overwriteParameterValues){overwriteParameterValues=false;return false;}
   public bool OnSharedFamilyFound(Family sharedFamily,bool familyInUse,out FamilySource source,out bool overwriteParameterValues){source=FamilySource.Project;overwriteParameterValues=false;return false;}
  }
 }
}
