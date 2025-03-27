import React from 'react';
import { createRoot } from 'react-dom/client';

// Define components directly in this file
const TabButton = ({ label, isActive, onClick }) => (
  <button 
    className={`tablink ${isActive ? 'active' : ''}`}
    onClick={onClick}
  >
    {label}
  </button>
);

const CategoryTab = () => (
  <div className="tab-inner-content">
    <div className="inner-grid">
      <div className="collection-card">
        <a href="/collections/example" className="collection-block-item">
          <div className="collection-image">
            <img 
              src="https://placehold.co/300x300" 
              alt="Example Collection"
              width="300"
              height="300"
            />
          </div>
          <h3>Example Collection</h3>
        </a>
      </div>
      {/* Add more collection cards as needed */}
    </div>
  </div>
);

const PartsTab = () => (
  <div className="tab-inner-content">
    <div className="inner-grid">
      <div className="collection-card">
        <a href="/collections/example-parts" className="collection-block-item">
          <div className="collection-image">
            <img 
              src="https://placehold.co/300x300" 
              alt="Example Parts"
              width="300"
              height="300"
            />
          </div>
          <h3 className="parts-brand-name">Example Parts</h3>
        </a>
      </div>
      {/* Add more parts cards as needed */}
    </div>
  </div>
);

// Main App component
const App = () => {
  const [activeTab, setActiveTab] = React.useState('category');
  
  return (
    <div className="container">
      <div className="title-buttons-grid">
        <TabButton 
          label="Search By Category" 
          isActive={activeTab === 'category'} 
          onClick={() => setActiveTab('category')} 
        />
        <TabButton 
          label="Search Parts" 
          isActive={activeTab === 'parts'} 
          onClick={() => setActiveTab('parts')} 
        />
      </div>
      
      {/* Tab content */}
      <div 
        id="category" 
        className="tab-content" 
        style={{ display: activeTab === 'category' ? 'block' : 'none' }}
      >
        <CategoryTab />
      </div>
      
      <div 
        id="parts" 
        className="tab-content" 
        style={{ display: activeTab === 'parts' ? 'block' : 'none' }}
      >
        <PartsTab />
      </div>
      
      {/* CSS styles (will be handled by style-loader) */}
      <style>{`
        .tablink {
          background-color: #dadbe2;
          border: 1px #294378 solid;
          border-radius: 20px;
          cursor: pointer;
          padding: 10px 15px;
          margin: 5px;
        }
        
        .tablink.active {
          background-color: #294378;
          color: #fff;
        }
        
        .title-buttons-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
          padding: 20px 0;
        }
        
        .inner-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 15px;
          padding: 20px;
        }
        
        .collection-card {
          text-align: center;
          padding: 15px;
          border: 1px solid #eee;
          border-radius: 8px;
        }
        
        .collection-card:hover {
          background-color: #294378;
          color: #fff;
        }
        
        .collection-image {
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .collection-image img {
          max-width: 100%;
          max-height: 100%;
          height: auto;
          border-radius: 4px;
          object-fit: contain;
        }
      `}</style>
    </div>
  );
};

// Wait for DOM to be ready and mount the app
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('container');
  
  if (container) {
    console.log('Container found, mounting React app');
    const root = createRoot(container);
    root.render(<App />);
  } else {
    console.error('Container element not found!');
  }
});
