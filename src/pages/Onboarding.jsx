import React, { useState } from 'react';
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, PlayCircle, Car, Building2, MonitorPlay, Trash2, Edit2, CheckCircle2, AlertCircle, Printer, Settings, Save, X, Download, Loader2 } from 'lucide-react';
import CompanyForm from '../components/onboarding/CompanyForm';
import CarForm from '../components/onboarding/CarForm';
import PrintableReport from '../components/onboarding/PrintableReport';
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useLanguage } from '../components/LanguageContext';

import { toast } from "sonner";

export default function Onboarding() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("welcome");
  const [isAddingCar, setIsAddingCar] = useState(false);
  const [editingCar, setEditingCar] = useState(null);
  const [isConfiguringVideos, setIsConfiguringVideos] = useState(false);
  const [videoUrls, setVideoUrls] = useState({ demo: '', setup: '' });
  const [isZipping, setIsZipping] = useState(false);

  // Fetch Company Profile
  const { data: companyProfileList, isLoading: isLoadingCompany } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: () => base44.entities.CompanyProfile.list(undefined, 1),
  });
  const companyProfile = companyProfileList?.[0];

  // Fetch Car Profiles
  const { data: carProfiles, isLoading: isLoadingCars } = useQuery({
    queryKey: ['carProfiles'],
    queryFn: () => base44.entities.CarProfile.list(),
  });

  // Fetch Onboarding Content
  const { data: onboardingContentList, isLoading: isLoadingContent } = useQuery({
    queryKey: ['onboardingContent'],
    queryFn: () => base44.entities.OnboardingContent.list(undefined, 1),
  });
  const onboardingContent = onboardingContentList?.[0];

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadZip = async () => {
    if (!carProfiles || carProfiles.length === 0) {
        toast.error(t('no_vehicles'));
        return;
    }

    setIsZipping(true);
    const zip = new JSZip();

    try {
        // Add company info if available
        if (companyProfile) {
            const companyInfo = `
Company Name: ${companyProfile.company_name}
Tax ID: ${companyProfile.tax_id || 'N/A'}
Address: ${companyProfile.address || 'N/A'}
Email: ${companyProfile.contact_email || 'N/A'}
Phone: ${companyProfile.phone || 'N/A'}
            `.trim();
            zip.file("company_info.txt", companyInfo);
        }

        // Process each car
        const carsFolder = zip.folder("fleet");
        
        for (const car of carProfiles) {
            const carFolderName = `${car.brand}_${car.model}_${car.id.slice(-4)}`.replace(/[^a-z0-9]/gi, '_');
            const carFolder = carsFolder.folder(carFolderName);

            // Car details text file
            const carDetails = `
Brand: ${car.brand}
Model: ${car.model}
Engine: ${car.engine_model || 'N/A'}
Transmission: ${car.transmission_type || 'N/A'}
Brakes: ${car.brakes_type || 'N/A'}
            `.trim();
            carFolder.file("details.txt", carDetails);

            // Helper to fetch and add file to zip
            const addFileToZip = async (url, filename) => {
                if (!url) return;
                try {
                    const response = await fetch(url);
                    const blob = await response.blob();
                    carFolder.file(filename, blob);
                } catch (e) {
                    console.error(`Failed to download ${filename}`, e);
                }
            };

            // Add photos
            await Promise.all([
                addFileToZip(car.image_connector_front, "connector_front.jpg"),
                addFileToZip(car.image_lever_side, "lever_side.jpg"),
                addFileToZip(car.image_ecu_part_number, "ecu_part_number.jpg"),
                addFileToZip(car.image_ecu_front, "ecu_front.jpg"),
                addFileToZip(car.image_extra_1, "extra_1.jpg"),
                addFileToZip(car.image_extra_2, "extra_2.jpg"),
                // Add docs - try to keep original extension or default to pdf/jpg based on url if possible, 
                // but for simplicity we'll just download the blob. 
                // To get correct extension we might need to parse URL or content-type, 
                // but let's assume they are identifiable files or just save with generic name if unknown.
                // Actually, let's try to guess extension from URL
                addFileToZip(car.file_electrical_scheme, `electrical_scheme${car.file_electrical_scheme?.split('.').pop().match(/^[a-z0-9]+$/i) ? '.' + car.file_electrical_scheme.split('.').pop() : '.pdf'}`),
                addFileToZip(car.file_sensors_actuators, `sensors_actuators${car.file_sensors_actuators?.split('.').pop().match(/^[a-z0-9]+$/i) ? '.' + car.file_sensors_actuators.split('.').pop() : '.pdf'}`)
            ]);
        }

        const content = await zip.generateAsync({ type: "blob" });
        saveAs(content, `onboarding_export_${new Date().toISOString().split('T')[0]}.zip`);
        toast.success(t('zip_ready'));

    } catch (error) {
        console.error("ZIP creation failed", error);
        toast.error(t('download_error'));
    } finally {
        setIsZipping(false);
    }
  };

  const handleSaveVideoUrls = async () => {
    try {
        if (onboardingContent?.id) {
            await base44.entities.OnboardingContent.update(onboardingContent.id, {
                demo_video_url: videoUrls.demo,
                setup_video_url: videoUrls.setup
            });
        } else {
            await base44.entities.OnboardingContent.create({
                demo_video_url: videoUrls.demo,
                setup_video_url: videoUrls.setup
            });
        }
        queryClient.invalidateQueries(['onboardingContent']);
        setIsConfiguringVideos(false);
    } catch (error) {
        console.error("Failed to save video URLs", error);
    }
  };

  const handleDeleteCar = async (id) => {
    if (window.confirm(t('delete_car_confirmation'))) {
        await base44.entities.CarProfile.delete(id);
        queryClient.invalidateQueries(['carProfiles']);
    }
  };

  const handleEditCar = (car) => {
    setEditingCar(car);
    setIsAddingCar(true);
  };

  const getEmbedUrl = (url) => {
    if (!url) return '';
    try {
        // Handle standard YouTube URLs including shorts, mobile, etc.
        const youtubeRegex = /(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})/;
        const match = url.match(youtubeRegex);
        
        if (match && match[1]) {
            return `https://www.youtube.com/embed/${match[1]}`;
        }
    } catch (e) {
        console.error("Error parsing video URL", e);
    }
    return url;
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Printable Report (Hidden by default, visible on print) */}
      <PrintableReport companyProfile={companyProfile} carProfiles={carProfiles} />

      {/* Main App Content (Hidden on print) */}
      <div className="print:hidden space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t('onboarding_title')}</h1>
                <p className="text-muted-foreground mt-1">{t('onboarding_desc')}</p>
            </div>
            <div className="flex items-center gap-3">
                {companyProfile && (
                    <div className="flex items-center gap-2 text-sm bg-[#00C600]/10 text-[#00C600] px-3 py-1 rounded-full border border-[#00C600]/20">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{companyProfile.company_name} {t('connected')}</span>
                    </div>
                )}
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrint} className="gap-2">
                        <Printer className="w-4 h-4" /> Export Report
                    </Button>
                    <Button 
                        variant="outline" 
                        onClick={handleDownloadZip}
                        disabled={isZipping}
                        className="gap-2"
                    >
                        {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        {isZipping ? t('preparing_zip') : t('download_zip')}
                    </Button>
                </div>
            </div>
          </div>

          <Tabs defaultValue="welcome" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px] bg-white dark:bg-[#2a2a2a]">
          <TabsTrigger value="welcome" className="data-[state=active]:bg-[#00C600] data-[state=active]:text-white">
            <MonitorPlay className="w-4 h-4 mr-2" /> {t('tab_welcome')}
          </TabsTrigger>
          <TabsTrigger value="company" className="data-[state=active]:bg-[#00C600] data-[state=active]:text-white">
            <Building2 className="w-4 h-4 mr-2" /> {t('tab_company')}
          </TabsTrigger>
          <TabsTrigger value="fleet" className="data-[state=active]:bg-[#00C600] data-[state=active]:text-white">
            <Car className="w-4 h-4 mr-2" /> {t('tab_fleet')}
          </TabsTrigger>
        </TabsList>

        {/* WELCOME TAB */}
        <TabsContent value="welcome" className="mt-6 space-y-6">
            <div className="flex justify-end mb-2">
                <Dialog open={isConfiguringVideos} onOpenChange={(open) => {
                    if (open && onboardingContent) {
                        setVideoUrls({ 
                            demo: onboardingContent.demo_video_url || '', 
                            setup: onboardingContent.setup_video_url || '' 
                        });
                    }
                    setIsConfiguringVideos(open);
                }}>
                    <DialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-xs text-gray-500">
                            <Settings className="w-3 h-3 mr-1" /> {t('configure_videos')}
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{t('configure_videos')}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('demo_url')}</label>
                                <Input 
                                    value={videoUrls.demo} 
                                    onChange={(e) => setVideoUrls(prev => ({...prev, demo: e.target.value}))} 
                                    placeholder="https://youtube.com/..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('setup_url')}</label>
                                <Input 
                                    value={videoUrls.setup} 
                                    onChange={(e) => setVideoUrls(prev => ({...prev, setup: e.target.value}))} 
                                    placeholder="https://youtube.com/..."
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsConfiguringVideos(false)}>{t('cancel')}</Button>
                            <Button onClick={handleSaveVideoUrls} className="bg-[#00C600] text-white">{t('save_changes')}</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Demo Video Card */}
                <Card className="overflow-hidden border-none shadow-lg bg-white dark:bg-[#2a2a2a]">
                    <div className="aspect-video bg-black relative group cursor-pointer">
                        {onboardingContent?.demo_video_url ? (
                            <iframe 
                                src={getEmbedUrl(onboardingContent.demo_video_url)} 
                                className="w-full h-full" 
                                title="Demo Video"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <>
                                <img 
                                    src="https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?q=80&w=1000&auto=format&fit=crop" 
                                    alt="Demo Video Thumbnail" 
                                    className="w-full h-full object-cover opacity-70 group-hover:opacity-50 transition-opacity"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <PlayCircle className="w-16 h-16 text-white opacity-80 group-hover:scale-110 transition-transform" />
                                </div>
                            </>
                        )}
                        <div className="absolute bottom-4 left-4 pointer-events-none">
                            <span className="bg-[#00C600] text-white text-xs px-2 py-1 rounded">DEMO</span>
                        </div>
                    </div>
                    <CardHeader>
                        <CardTitle>{t('platform_overview')}</CardTitle>
                        <CardDescription>{t('platform_desc')}</CardDescription>
                    </CardHeader>
                </Card>

                {/* Setup Video Card */}
                <Card className="overflow-hidden border-none shadow-lg bg-white dark:bg-[#2a2a2a]">
                    <div className="aspect-video bg-black relative group cursor-pointer">
                        {onboardingContent?.setup_video_url ? (
                            <iframe 
                                src={getEmbedUrl(onboardingContent.setup_video_url)} 
                                className="w-full h-full" 
                                title="Setup Video"
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <>
                                <img 
                                    src="https://images.unsplash.com/photo-1487754180451-c456f719a1fc?q=80&w=1000&auto=format&fit=crop" 
                                    alt="Setup Video Thumbnail" 
                                    className="w-full h-full object-cover opacity-70 group-hover:opacity-50 transition-opacity"
                                />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <PlayCircle className="w-16 h-16 text-white opacity-80 group-hover:scale-110 transition-transform" />
                                </div>
                            </>
                        )}
                        <div className="absolute bottom-4 left-4 pointer-events-none">
                            <span className="bg-[#00C600] text-white text-xs px-2 py-1 rounded">TUTORIAL</span>
                        </div>
                    </div>
                    <CardHeader>
                        <CardTitle>{t('install_setup')}</CardTitle>
                        <CardDescription>{t('install_desc')}</CardDescription>
                    </CardHeader>
                </Card>
            </div>
            
            <div className="flex justify-end">
                <Button onClick={() => setActiveTab("company")} className="bg-[#00C600] hover:bg-[#00b300] text-white">
                    {t('get_started')} <CheckCircle2 className="w-4 h-4 ml-2" />
                </Button>
            </div>
        </TabsContent>

        {/* COMPANY TAB */}
        <TabsContent value="company" className="mt-6">
            <Card className="bg-white dark:bg-[#2a2a2a] border-none shadow-lg p-6">
                {isLoadingCompany ? (
                    <div className="space-y-4">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : (
                    <CompanyForm 
                        initialData={companyProfile} 
                        onComplete={() => setActiveTab("fleet")} 
                    />
                )}
            </Card>
        </TabsContent>

        {/* FLEET TAB */}
        <TabsContent value="fleet" className="mt-6">
            {isAddingCar ? (
                <div className="bg-white dark:bg-[#2a2a2a] rounded-xl p-6 shadow-lg">
                    <CarForm 
                        initialData={editingCar}
                        onCancel={() => {
                            setIsAddingCar(false);
                            setEditingCar(null);
                        }} 
                        onSuccess={() => {
                            setIsAddingCar(false);
                            setEditingCar(null);
                            queryClient.invalidateQueries(['carProfiles']);
                        }} 
                    />
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-semibold">{t('your_vehicles')}</h2>
                        <Button onClick={() => setIsAddingCar(true)} className="bg-[#00C600] hover:bg-[#00b300] text-white">
                            <Plus className="w-4 h-4 mr-2" /> {t('add_vehicle')}
                        </Button>
                    </div>

                    {isLoadingCars ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <Skeleton className="h-64 w-full rounded-xl" />
                            <Skeleton className="h-64 w-full rounded-xl" />
                            <Skeleton className="h-64 w-full rounded-xl" />
                        </div>
                    ) : carProfiles?.length === 0 ? (
                        <Card className="border-dashed border-2 border-gray-300 dark:border-gray-700 bg-transparent">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <div className="w-16 h-16 bg-gray-100 dark:bg-[#333] rounded-full flex items-center justify-center mb-4">
                                    <Car className="w-8 h-8 text-gray-400" />
                                </div>
                                <h3 className="text-lg font-semibold mb-1">{t('no_vehicles')}</h3>
                                <p className="text-muted-foreground mb-6 max-w-sm">
                                    {t('no_vehicles_desc')}
                                </p>
                                <Button onClick={() => setIsAddingCar(true)} variant="outline" className="border-[#00C600] text-[#00C600] hover:bg-[#00C600] hover:text-white">
                                    <Plus className="w-4 h-4 mr-2" /> {t('add_first_car')}
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {carProfiles?.map((car) => (
                                <Card key={car.id} className="overflow-hidden bg-white dark:bg-[#2a2a2a] border-none shadow-md hover:shadow-xl transition-all group">
                                    <div className="aspect-[4/3] relative bg-gray-100 dark:bg-black">
                                        {car.image_connector_front ? (
                                            <img 
                                                src={car.image_connector_front} 
                                                alt={car.model} 
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <Car className="w-12 h-12" />
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                                            <Button size="icon" variant="secondary" className="h-8 w-8 bg-white/90 text-black hover:bg-white" onClick={() => handleEditCar(car)}>
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => handleDeleteCar(car.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <h3 className="font-bold text-lg">{car.brand} {car.model}</h3>
                                                <p className="text-sm text-muted-foreground">{car.engine_model || 'No engine info'}</p>
                                            </div>
                                            <span className="text-xs font-mono bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                                                {car.transmission_type}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-4 mt-4 text-sm text-gray-500 dark:text-gray-400">
                                            <div className="flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-[#00C600]" />
                                                {t('docs')}
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <CheckCircle2 className="w-3 h-3 text-[#00C600]" />
                                                {t('photos')}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}