using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using Autodesk.Revit.UI;
namespace NubeBIM {
 public partial class LibraryPane:Page,IDockablePaneProvider,IDisposable {
  private readonly RevitEventBridge _bridge;
  private readonly FamilyPlacement _placement=new FamilyPlacement();
  private RepositoryClient? _client;
  private List<CategoryInfo> _categories=new List<CategoryInfo>();
  private List<FamilyCard> _families=new List<FamilyCard>();
  private CancellationTokenSource? _thumbnails;
  private bool _busy,_disposed,_initialized,_categoryMenuOpen,_accountOpen,_largeCards;
  private int _year;
  private string _category="all",_subcategory="all";
  public LibraryPane(RevitEventBridge bridge){
   _bridge=bridge;InitializeComponent();Tag=SystemParameters.ClientAreaAnimation;
   BuildLabel.Text="FAMBIT "+System.Reflection.Assembly.GetExecutingAssembly().GetName().Version?.ToString(3);
#if NUBE_LOCAL_TEST
   BuildLabel.Text+=" · prueba local";
#endif
   Loaded+=async(s,e)=>await InitializeAsync();
  }
  public void SetupDockablePane(DockablePaneProviderData data){data.FrameworkElement=this;data.InitialState=new DockablePaneState{DockPosition=DockPosition.Right};}
  // Called only from a Revit event or command; WPF event handlers never read the Revit document directly.
  public void UpdateContext(UIApplication app){
   if(_disposed)return;
   _year=int.Parse(app.Application.VersionNumber);RevitLabel.Text="REVIT "+_year;
   var doc=app.ActiveUIDocument?.Document;
   var label=doc!=null&&doc.IsValidObject&&!doc.IsFamilyDocument?doc.Title:"Abre una vista de tu proyecto .rvt para colocar familias";
   if(ProjectLabel.Text!=label)ProjectLabel.Text=label;
   if(IsVisible&&!_initialized&&!_busy)_=InitializeAsync();
  }
  private RepositoryClient Client=>_client??(_client=new RepositoryClient());
  private async Task InitializeAsync(){if(_disposed||_initialized||_year==0)return;_initialized=true;try{if(Client.HasSession)await RefreshData();else LoginPanel.Visibility=Visibility.Visible;}catch(Exception ex){ShowError(ex);}}
  private void Busy(bool value){_busy=value;if(_disposed)return;Progress.Visibility=value?Visibility.Visible:Visibility.Collapsed;RefreshButton.IsEnabled=!value;ActivateButton.IsEnabled=!value;LogoutButton.IsEnabled=!value;UpdateButton.IsEnabled=!value;FamilyTiles.IsEnabled=!value;}
  private void ShowError(Exception ex){if(_disposed)return;StatusLabel.Text=ex.Message;LoginStatus.Text=ex.Message;if(_client==null||!_client.HasSession){CancelThumbnails();SetLibrary();Navigation();_families.Clear();Filter();LoginPanel.Visibility=Visibility.Visible;}}
  private void CancelThumbnails(){_thumbnails?.Cancel();_thumbnails?.Dispose();_thumbnails=null;}
  private async Task RefreshData(){
   if(_year==0){StatusLabel.Text="Abre un proyecto Revit antes de actualizar la biblioteca.";return;}
   Busy(true);CancelThumbnails();
   try{
    var groups=await Client.GetAsync<CategoryResult>("client/categories");
    var result=await Client.FamiliesAsync(_year);
    if(_disposed)return;
    _categories=groups.Categories??new List<CategoryInfo>();
    _families=(result.Families??new List<FamilyInfo>()).Select(f=>new FamilyCard(f,_categories.Find(c=>c.Id==f.Category))).ToList();
    SetLibrary();
    CategoryTiles.ItemsSource=_categories.Select(c=>new CategoryCard(c,_families.Count(f=>f.Info.Category==c.Id))).ToList();
    if(!_categories.Any(c=>c.Id==_category))_category="all";
    LoginPanel.Visibility=Visibility.Collapsed;Navigation();Filter();StatusLabel.Text="Elige una tarjeta para cargar la familia y colocarla en tu proyecto.";
    _thumbnails=new CancellationTokenSource();_=LoadThumbnailsAsync(_families.ToList(),_thumbnails.Token,_year);
   }catch(Exception ex){ShowError(ex);}finally{Busy(false);}
  }
  private async Task LoadThumbnailsAsync(List<FamilyCard> cards,CancellationToken cancellation,int year){
   using(var slots=new SemaphoreSlim(4)){
    var tasks=cards.Where(f=>f.Info.HasThumbnail).Select(async card=>{
     bool acquired=false;try{await slots.WaitAsync(cancellation);acquired=true;var image=await Client.ThumbnailAsync(card.Info,year,cancellation);if(!_disposed&&!cancellation.IsCancellationRequested)card.Image=image;}
     catch(OperationCanceledException){}
     catch(Exception ex){if(!_disposed&&!cancellation.IsCancellationRequested){card.PreviewText="Vista previa no disponible";if(_client!=null&&!_client.HasSession)ShowError(ex);}}
     finally{if(acquired)slots.Release();}
    });
    await Task.WhenAll(tasks);
   }
  }
  private async void ActivateLicense(object sender,RoutedEventArgs e){if(_busy)return;Busy(true);LoginStatus.Text="Activación en curso…";try{await Client.ActivateAsync(EmailBox.Text,KeyBox.Password);if(_disposed)return;KeyBox.Clear();await RefreshData();}catch(Exception ex){ShowError(ex);}finally{Busy(false);}}
  private async void Refresh(object sender,RoutedEventArgs e){if(!_busy){if(_client==null||!_client.HasSession){_initialized=false;await InitializeAsync();}else await RefreshData();}}
  private void SearchChanged(object sender,TextChangedEventArgs e){if(SearchHint!=null)SearchHint.Visibility=string.IsNullOrEmpty(SearchBox.Text)?Visibility.Visible:Visibility.Collapsed;Filter();}
  private void SetLibrary(){_accountOpen=false;AccountPanel.Visibility=Visibility.Collapsed;LibraryContent.Visibility=Visibility.Visible;}
  private void ShowLibrary(object sender,RoutedEventArgs e){SetLibrary();_category="all";_subcategory="all";_categoryMenuOpen=false;SearchBox.Clear();Navigation();Filter();CatalogScroll.ScrollToTop();}
  private void ShowAccount(object sender,RoutedEventArgs e){_accountOpen=true;AccountPanel.Visibility=Visibility.Visible;LibraryContent.Visibility=Visibility.Collapsed;Navigation();}
  private void ToggleCategories(object sender,RoutedEventArgs e){SetLibrary();_categoryMenuOpen=!_categoryMenuOpen;Navigation();CatalogScroll.ScrollToTop();}
  private void ToggleDensity(object sender,RoutedEventArgs e){_largeCards=!_largeCards;FamilyTiles.Tag=_largeCards?155:104;DensityButton.ToolTip=_largeCards?"Compactar tarjetas":"Ampliar tarjetas";}
  private void CategoryClick(object sender,RoutedEventArgs e){if((sender as FrameworkElement)?.DataContext is CategoryCard category){SetLibrary();_category=category.Info.Id;_subcategory="all";_categoryMenuOpen=false;Navigation();Filter();CatalogScroll.ScrollToTop();}}
  private void AllCategories(object sender,RoutedEventArgs e){SetLibrary();_category="all";_subcategory="all";_categoryMenuOpen=false;Navigation();Filter();CatalogScroll.ScrollToTop();}
  private void Navigation(){
   var category=_categories.Find(c=>c.Id==_category);var palette=Palette.For("");
   LibraryButton.Background=!_accountOpen&&!_categoryMenuOpen?palette.Background:System.Windows.Media.Brushes.Transparent;
   LibraryButton.BorderBrush=!_accountOpen&&!_categoryMenuOpen?new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(213,218,224)):System.Windows.Media.Brushes.Transparent;
   CategoriesButton.Background=!_accountOpen&&_categoryMenuOpen?palette.Background:System.Windows.Media.Brushes.Transparent;
   AccountButton.Background=_accountOpen?palette.Background:System.Windows.Media.Brushes.Transparent;
   CategoryHome.Visibility=_categoryMenuOpen?Visibility.Visible:Visibility.Collapsed;
   BackButton.Visibility=category==null?Visibility.Collapsed:Visibility.Visible;
   var subcategory=category?.Subcategories.Find(s=>s.Id==_subcategory);
   BreadcrumbLabel.Text="Biblioteca / "+(category?.Name??"Todas las familias")+(subcategory==null?"":" / "+subcategory.Name);
   SubcategoryChips.Children.Clear();SubcategoryChips.Visibility=!_categoryMenuOpen&&category!=null?Visibility.Visible:Visibility.Collapsed;
   if(category==null)return;
   var choices=new[]{new SubcategoryInfo{Id="all",Name="Todo"}}.Concat(category.Subcategories);
   foreach(var sub in choices){
    var selected=sub.Id==_subcategory;
    var button=new Button{Content=sub.Name,Tag=sub.Id,FontSize=12,FontWeight=selected?FontWeights.Medium:FontWeights.Normal,Padding=new Thickness(9,5,9,5),Margin=new Thickness(0,0,5,5),Background=selected?new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(237,240,243)):System.Windows.Media.Brushes.White,Foreground=selected?System.Windows.Media.Brushes.Black:palette.Foreground,BorderBrush=selected?new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(203,210,217)):new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(231,234,238))};
    button.Click+=(s,e)=>{_subcategory=(string)((Button)s).Tag;Navigation();Filter();CatalogScroll.ScrollToTop();};SubcategoryChips.Children.Add(button);
   }
  }
  private void Filter(){
   if(FamilyTiles==null||SearchBox==null||EmptyPanel==null)return;var query=SearchBox.Text.Trim();
   var visible=_families.Where(f=>(_category=="all"||f.Info.Category==_category)&&(_subcategory=="all"||f.Info.Subcategory==_subcategory)&&(f.Name+" "+f.Info.Description).IndexOf(query,StringComparison.CurrentCultureIgnoreCase)>=0).ToList();
   FamilyTiles.ItemsSource=visible;EmptyPanel.Visibility=visible.Count==0?Visibility.Visible:Visibility.Collapsed;ResultsLabel.Text=visible.Count+(visible.Count==1?" resultado":" resultados");
   EmptyLabel.Text=_families.Count==0?"Añade familias e imágenes desde el panel de administración y pulsa Actualizar.":"Prueba otra subcategoría o cambia tu búsqueda.";
  }
  private async void FamilyClick(object sender,RoutedEventArgs e){
   if(_busy||_disposed||!((sender as FrameworkElement)?.DataContext is FamilyCard card))return;
   Busy(true);string? path=null;
   try{
    StatusLabel.Text="Preparando «"+card.Name+"»…";
    var target=await _bridge.RunAsync(app=>FamilyPlacement.Capture(app));if(_disposed)return;
    StatusLabel.Text="Descargando «"+card.Name+"» para «"+target.Title+"»…";
    path=await Client.DownloadAsync(card.Info,target.Year);if(_disposed)return;
    var downloaded=path;
    var result=await _bridge.RunAsync(app=>_placement.LoadAndPlace(app,target,downloaded,card.Info.Id));
    if(!_disposed)StatusLabel.Text=result.Message;
   }catch(TaskCanceledException){}catch(Exception ex){ShowError(ex);}finally{if(path!=null)RepositoryClient.DeleteDownload(path);Busy(false);}
  }
  private async void Logout(object sender,RoutedEventArgs e){if(_busy)return;Busy(true);CancelThumbnails();try{await Client.LogoutAsync();if(_disposed)return;SetLibrary();Navigation();_families.Clear();Filter();LoginPanel.Visibility=Visibility.Visible;LoginStatus.Text="Sesión cerrada. Puedes activar otra licencia.";}catch(Exception ex){ShowError(ex);}finally{Busy(false);}}
  private async void CheckUpdate(object sender,RoutedEventArgs e){
   if(_busy)return;Busy(true);
   try{var result=await Client.GetAsync<ReleaseResult>("client/releases");if(_disposed)return;var current=System.Reflection.Assembly.GetExecutingAssembly().GetName().Version??new Version(0,3,0);var release=result.Releases.Where(r=>Version.TryParse(r.Version,out var v)&&v>current).OrderByDescending(r=>Version.Parse(r.Version)).FirstOrDefault();
    if(release==null){StatusLabel.Text="FAMBIT está al día con las versiones publicadas.";return;}
    if(!Uri.TryCreate(release.Url,UriKind.Absolute,out var uri)||uri.Scheme!="https"||!string.IsNullOrEmpty(uri.UserInfo))throw new InvalidOperationException("El enlace de actualización no es válido.");
    if(MessageBox.Show("FAMBIT "+release.Version+" está disponible.\n\n"+release.Notes+"\n\n¿Abrir la descarga? Cierra Revit antes de instalar.","FAMBIT",MessageBoxButton.YesNo,MessageBoxImage.Information)==MessageBoxResult.Yes)Process.Start(new ProcessStartInfo(uri.AbsoluteUri){UseShellExecute=true});
   }catch(Exception ex){ShowError(ex);}finally{Busy(false);}
  }
  public void Dispose(){if(_disposed)return;_disposed=true;CancelThumbnails();_client?.Dispose();}
 }
}
