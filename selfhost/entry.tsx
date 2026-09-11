import React from 'react';
import {createRoot} from 'react-dom/client';
import Workspace from '../app/workspace';
import '../app/globals.css';
createRoot(document.getElementById('root')!).render(<Workspace name="Administrador" email="Panel de administración" logoutAction="/admin/logout"/>);
