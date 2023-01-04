import './App.css';
import Main from './Main';
import Canvas from './Canvas';
import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';

const App = () => {
    return (
      <Router>
        <Routes>
          <Route path="/" element={<Main />} />
          <Route path="/view/:key" element={<Canvas />} />
        </Routes>
      </Router>  
    )
}

export default App;