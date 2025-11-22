import React from 'react';
import Navbar from './components/Navbar';
import HeroSection from './components/HeroSection';
import HowItWorksSection from './components/HowItWorksSection';
import FeaturesSection from './components/FeaturesSection';
import Footer from './components/Footer';
import './index.css';

function App() {
  return (
    <div className="app-wrapper">
      <Navbar />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <FeaturesSection />
      </main>
      <Footer />
    </div>
  );
}

export default App;
