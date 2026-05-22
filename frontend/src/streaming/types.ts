export interface EmergencyImage {
  id: string;
  name: string;
  dataUrl: string;
}

export interface CompanyEmergencyFallback {
  autoplayEnabled: boolean;
  selectedImageId: string | null;
  images: EmergencyImage[];
}

export interface PublicEmergencyFallback {
  autoplayEnabled: boolean;
  selectedImage: EmergencyImage | null;
}

export const MAX_EMERGENCY_IMAGES = 10;