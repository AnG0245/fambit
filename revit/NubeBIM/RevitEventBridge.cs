using System;
using System.Threading.Tasks;
using Autodesk.Revit.UI;
namespace NubeBIM {
 // All Revit API work runs inside Execute, including reads before an async download.
 public sealed class RevitEventBridge:IExternalEventHandler,IDisposable {
  private readonly ExternalEvent _external;
  private Action<UIApplication>? _pending;
  private Action? _cancel;
  private bool _disposed;
  public RevitEventBridge(){_external=ExternalEvent.Create(this);}
  public Task<T> RunAsync<T>(Func<UIApplication,T> work){
   if(_disposed)throw new ObjectDisposedException(nameof(RevitEventBridge));
   if(_pending!=null)throw new InvalidOperationException("Revit tiene una solicitud de FAMBIT pendiente. Espera un momento.");
   var result=new TaskCompletionSource<T>(TaskCreationOptions.RunContinuationsAsynchronously);
   _pending=app=>{try{result.TrySetResult(work(app));}catch(Exception ex){result.TrySetException(ex);}};
   _cancel=()=>result.TrySetCanceled();
   try{
    if(_external.Raise()!=ExternalEventRequest.Accepted){_pending=null;_cancel=null;result.TrySetException(new InvalidOperationException("Finaliza la operación actual de Revit y vuelve a intentarlo."));}
   }catch(Exception ex){_pending=null;_cancel=null;result.TrySetException(ex);}
   return result.Task;
  }
  public void Execute(UIApplication app){var work=_pending;_pending=null;_cancel=null;work?.Invoke(app);}
  public string GetName()=>"FAMBIT · Biblioteca y colocación";
  public void Dispose(){if(_disposed)return;_disposed=true;_pending=null;_cancel?.Invoke();_cancel=null;_external.Dispose();}
 }
}
