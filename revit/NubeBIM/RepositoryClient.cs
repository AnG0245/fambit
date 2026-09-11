using System;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Threading;
using System.Windows.Media.Imaging;
namespace NubeBIM {
 public sealed class RepositoryClient:IDisposable {
  private readonly HttpClient _http;private readonly string _credential;private string _token;
  public bool HasSession=>!string.IsNullOrEmpty(_token);
  public RepositoryClient(){
   var configFile=Path.Combine(Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location)!,"nube.config.json");
   if(!File.Exists(configFile))throw new InvalidOperationException("El instalador no tiene configurado el servidor de FAMBIT.");
   var config=Json.Read<Config>(File.ReadAllText(configFile));
   if(!Uri.TryCreate((config.ApiBaseUrl??"").TrimEnd('/')+"/",UriKind.Absolute,out var uri)||!AllowedServer(uri)||!string.IsNullOrEmpty(uri.UserInfo)||!string.IsNullOrEmpty(uri.Query)||!string.IsNullOrEmpty(uri.Fragment)||uri.AbsolutePath!="/api/")throw new InvalidOperationException("La dirección del servidor debe ser HTTPS y terminar en /api/.");
   _http=new HttpClient(new HttpClientHandler{AllowAutoRedirect=false}){BaseAddress=uri,Timeout=TimeSpan.FromSeconds(120)};
   _credential="NubeBIM/"+Hash(Encoding.UTF8.GetBytes(uri.AbsoluteUri));_token=CredentialStore.Load(_credential);
  }
  private static bool AllowedServer(Uri uri){
#if NUBE_LOCAL_TEST
   return uri.Scheme=="http"&&(uri.Host=="127.0.0.1"||uri.Host=="localhost"||uri.Host=="[::1]"||uri.Host=="::1");
#else
   return uri.Scheme=="https";
#endif
  }
  public async Task ActivateAsync(string email,string key){
   var local=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"NubeBIM");Directory.CreateDirectory(local);
   var idFile=Path.Combine(local,"device-id.txt");if(!File.Exists(idFile)){try{using(var s=new StreamWriter(new FileStream(idFile,FileMode.CreateNew)))s.Write(Guid.NewGuid().ToString("N"));}catch(IOException){}}
   var payload=new ActivationRequest{Email=email.Trim(),Key=key.Trim(),DeviceId=File.ReadAllText(idFile).Trim(),DeviceName=Environment.MachineName};
   using(var request=new HttpRequestMessage(HttpMethod.Post,"client/activate")){request.Content=new StringContent(Json.Write(payload),Encoding.UTF8,"application/json");using(var response=await _http.SendAsync(request)){await Check(response);var result=Json.Read<ActivationResult>(await response.Content.ReadAsStringAsync());if(result.Token.Length!=64)throw new InvalidOperationException("Respuesta de activación inválida.");CredentialStore.Save(_credential,result.Token);_token=result.Token;}}
  }
  private HttpRequestMessage Request(HttpMethod method,string route){var req=new HttpRequestMessage(method,route);req.Headers.Authorization=new AuthenticationHeaderValue("Bearer",_token);return req;}
  public async Task<T> GetAsync<T>(string route){using(var req=Request(HttpMethod.Get,route))using(var res=await _http.SendAsync(req)){await Check(res);return Json.Read<T>(await res.Content.ReadAsStringAsync());}}
  public async Task ValidateAsync(){using(var req=Request(HttpMethod.Get,"client/session"))using(var res=await _http.SendAsync(req)){await Check(res);}}
  public async Task LogoutAsync(){using(var req=Request(HttpMethod.Delete,"client/session"))using(var res=await _http.SendAsync(req)){if(res.StatusCode!=HttpStatusCode.Unauthorized&&res.StatusCode!=HttpStatusCode.Forbidden)await Check(res);}ForgetSession();}
  public void ForgetSession(){CredentialStore.Clear(_credential);_token="";}
  public async Task<string> DownloadAsync(FamilyInfo family,int year){
   if(family.Revit>year)throw new InvalidOperationException("La familia requiere una versión posterior de Revit.");
   var folder=Path.Combine(Path.GetTempPath(),"NubeBIM",Guid.NewGuid().ToString("N"));Directory.CreateDirectory(folder);
   // Give each catalog item its own filename: distinct downloads must not all load as "family.rfa".
   var stem=new string(family.Name.Select(c=>char.IsLetterOrDigit(c)||c==' '||c=='-'||c=='_'?c:'_').ToArray()).Trim();
   if(stem.Length==0)stem="Familia";if(stem.Length>60)stem=stem.Substring(0,60);
   var path=Path.Combine(folder,stem+"-"+Hash(Encoding.UTF8.GetBytes(family.Id)).Substring(0,12)+".rfa");
   try{using(var req=Request(HttpMethod.Get,"client/families/"+Uri.EscapeDataString(family.Id)+"/file?revit="+year))using(var res=await _http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead)){
    await Check(res);if(res.Content.Headers.ContentLength>25*1024*1024)throw new InvalidOperationException("El archivo excede el límite permitido.");
    using(var input=await res.Content.ReadAsStreamAsync())using(var output=File.Create(path)){var b=new byte[81920];int n;long total=0;while((n=await input.ReadAsync(b,0,b.Length))>0){total+=n;if(total>25*1024*1024)throw new InvalidOperationException("Archivo demasiado grande.");await output.WriteAsync(b,0,n);}}
   }
   using(var sha=SHA256.Create())using(var s=File.OpenRead(path)){var hash=BitConverter.ToString(sha.ComputeHash(s)).Replace("-","").ToLowerInvariant();if(!string.Equals(hash,family.Sha256,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("El archivo cambió o está incompleto. Actualiza la biblioteca e intenta otra vez.");}
   await ValidateAsync();return path;
   }catch{DeleteDownload(path);throw;}
  }
  public async Task<BitmapSource?> ThumbnailAsync(FamilyInfo family,int year,CancellationToken cancellation){
   if(!family.HasThumbnail)return null;
   using(var req=Request(HttpMethod.Get,"client/families/"+Uri.EscapeDataString(family.Id)+"/thumbnail?revit="+year))
   using(var res=await _http.SendAsync(req,HttpCompletionOption.ResponseHeadersRead,cancellation)){
    await Check(res);if(res.Content.Headers.ContentLength>2*1024*1024)throw new InvalidOperationException("La imagen supera el tamaño permitido.");
    var media=res.Content.Headers.ContentType?.MediaType;if(media!="image/png"&&media!="image/jpeg")throw new InvalidOperationException("La vista previa no es una imagen PNG o JPG.");
    using(var input=await res.Content.ReadAsStreamAsync())using(var data=new MemoryStream()){
     var buffer=new byte[16384];int read;while((read=await input.ReadAsync(buffer,0,buffer.Length,cancellation))>0){if(data.Length+read>2*1024*1024)throw new InvalidOperationException("La imagen supera el tamaño permitido.");await data.WriteAsync(buffer,0,read,cancellation);}
     cancellation.ThrowIfCancellationRequested();data.Position=0;var image=new BitmapImage();image.BeginInit();image.CacheOption=BitmapCacheOption.OnLoad;image.DecodePixelWidth=440;image.StreamSource=data;image.EndInit();image.Freeze();return image;
    }
   }
  }
  private async Task Check(HttpResponseMessage r){if(r.IsSuccessStatusCode)return;if(r.StatusCode==HttpStatusCode.Unauthorized||r.StatusCode==HttpStatusCode.Forbidden)ForgetSession();var text=await r.Content.ReadAsStringAsync();try{var err=Json.Read<ErrorResult>(text);if(!string.IsNullOrEmpty(err.Error))throw new InvalidOperationException(err.Error);}catch(InvalidOperationException){throw;}catch{}throw new InvalidOperationException("No se pudo acceder al servidor. Verifica la conexión y la licencia.");}
  private static string Hash(byte[] data){using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(data)).Replace("-","");}
  public static void DeleteDownload(string path){try{var dir=Path.GetDirectoryName(path);File.Delete(path);if(dir!=null&&Directory.Exists(dir)&&!Directory.EnumerateFileSystemEntries(dir).Any())Directory.Delete(dir);}catch(IOException){}catch(UnauthorizedAccessException){}}
  public void Dispose(){_http.Dispose();}
 }
}
