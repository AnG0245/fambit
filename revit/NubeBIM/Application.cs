using System;
using System.Reflection;
using System.Windows.Media.Imaging;
using Autodesk.Revit.UI;
using Autodesk.Revit.UI.Events;
using Autodesk.Revit.DB;
using Autodesk.Revit.Attributes;

namespace NubeBIM {
 public sealed class App:IExternalApplication {
  public static readonly DockablePaneId PaneId=new DockablePaneId(new Guid("0C6F9D2A-2FCE-45D1-9537-6FECF75F1394"));
  internal static LibraryPane? Pane;
  private RevitEventBridge? _bridge;
  public Result OnStartup(UIControlledApplication app){
   try{
    _bridge=new RevitEventBridge();Pane=new LibraryPane(_bridge);
    app.RegisterDockablePane(PaneId,"FAMBIT · Biblioteca",Pane);
    app.Idling+=OnIdling;
    try{app.CreateRibbonTab("FAMBIT");}catch(Autodesk.Revit.Exceptions.ArgumentException){}
    var panel=app.CreateRibbonPanel("FAMBIT","Biblioteca");
    var data=new PushButtonData("NubeBIM.Library","Abrir\nFAMBIT",Assembly.GetExecutingAssembly().Location,typeof(OpenLibrary).FullName);
    var button=(PushButton)panel.AddItem(data);button.ToolTip="Abre tu biblioteca acoplable. Elige una familia y colócala en el proyecto.";
    button.LargeImage=RibbonIcon(32);button.Image=RibbonIcon(16);
    return Result.Succeeded;
   }catch(Exception ex){app.Idling-=OnIdling;Pane?.Dispose();Pane=null;_bridge?.Dispose();TaskDialog.Show("FAMBIT",ex.Message);return Result.Failed;}
  }
  private static BitmapImage RibbonIcon(int width){
   var image=new BitmapImage();image.BeginInit();image.UriSource=new Uri("pack://application:,,,/NubeBIM;component/Assets/fambit-mark.png",UriKind.Absolute);image.DecodePixelWidth=width;image.CacheOption=BitmapCacheOption.OnLoad;image.EndInit();image.Freeze();return image;
  }
  private void OnIdling(object sender,IdlingEventArgs e){if(sender is UIApplication app)Pane?.UpdateContext(app);}
  public Result OnShutdown(UIControlledApplication app){app.Idling-=OnIdling;Pane?.Dispose();Pane=null;_bridge?.Dispose();return Result.Succeeded;}
 }
 [Transaction(TransactionMode.Manual)] public sealed class OpenLibrary:IExternalCommand {
  public Result Execute(ExternalCommandData data,ref string message,ElementSet elements){
   try{App.Pane?.UpdateContext(data.Application);data.Application.GetDockablePane(App.PaneId).Show();return Result.Succeeded;}
   catch(Exception ex){message=ex.Message;return Result.Failed;}
  }
 }
}
