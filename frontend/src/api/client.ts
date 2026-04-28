import axios from 'axios';

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  is_active: boolean;
  camera_ids: number[];
  created_at: string;
}

export interface Camera {
  id: number;
  name: string;
  source_type: string;
  rtsp_url: string;
  onvif_xaddr?: string;
  onvif_username?: string;
  stream_key: string;
  enabled: boolean;
  created_at: string;
  flv_url: string;
  ws_flv_url: string;
}

export interface OnvifDevice {
  xaddr: string;
  endpoint?: string;
  types?: string;
  host?: string;
  port?: number;
}

export interface Recording {
  id: number;
  camera_id: number;
  stream_key: string;
  file_path: string;
  file_name: string;
  file_size: number;
  start_time?: string;
  duration: number;
  created_at: string;
  play_url: string;
}

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('budcam_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('budcam_token');
      window.dispatchEvent(new Event('budcam:logout'));
    }
    return Promise.reject(error);
  },
);
