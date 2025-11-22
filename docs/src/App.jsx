import React from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import FeaturesSection from './components/FeaturesSection';
import FAQSection from './components/FAQSection';
import ResourcesSection from './components/ResourcesSection';
import Footer from './components/Footer';
import './index.css';

function App() {
  return (
    <div className="app-wrapper">
      <Navbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <FAQSection />
        <ResourcesSection />
      </main>
      <Footer />
    </div>
  );
}

export default App;
