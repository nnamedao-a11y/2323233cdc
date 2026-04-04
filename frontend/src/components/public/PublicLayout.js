/**
 * Public Layout Component
 * 
 * Layout wrapper для публічного сайту
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';

const PublicLayout = () => {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-50">
      <PublicHeader />
      <main className="flex-grow">
        <Outlet />
      </main>
      <PublicFooter />
    </div>
  );
};

export default PublicLayout;
