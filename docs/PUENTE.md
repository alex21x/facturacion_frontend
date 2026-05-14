<?php
defined('BASEPATH') OR exit('No direct script access allowed');

use Greenter\Ws\Services\ConsultCdrService;
use Greenter\Ws\Services\SoapClient;

use Greenter\Ws\Services\SunatEndpoints;
use Greenter\See;

use Greenter\Model\Client\Client;
use Greenter\Model\Company\Company;
use Greenter\Model\Company\Address;
use Greenter\Model\Sale\Invoice;
use Greenter\Model\Sale\SaleDetail;
use Greenter\Model\Sale\Legend;
use Greenter\Model\Sale\Charge;


//COMUNICACION DE BAJA
use Greenter\Model\Voided\Voided;
use Greenter\Model\Voided\VoidedDetail;

//RESUMEN
use Greenter\Model\Sale\Document;
use Greenter\Model\Summary\Summary;
use Greenter\Model\Summary\SummaryDetail;
use Greenter\Model\Summary\SummaryPerception;

//NOTA CREDITO
use Greenter\Model\Sale\Note;

use Greenter\XMLSecLibs\Certificate\X509Certificate;
use Greenter\XMLSecLibs\Certificate\X509ContentType;

//GUÍA DE REMISIÓN
use Greenter\Model\Despatch\Despatch;
use Greenter\Model\Despatch\DespatchDetail;
use Greenter\Model\Despatch\Direction;
use Greenter\Model\Despatch\Driver;
use Greenter\Model\Despatch\Shipment;
use Greenter\Model\Despatch\Vehicle;
use Greenter\Model\Despatch\Transportist;

use Greenter\Model\Sale\FormaPagos\FormaPagoContado;
use Greenter\Model\Sale\Cuota;
use Greenter\Model\Sale\FormaPagos\FormaPagoCredito;

use Greenter\Model\Sale\Detraction;

use Greenter\Ws\Services\SunatConsult;

class Sunat extends CI_Controller {
    
    public function __construct()
    {
    	parent::__construct();
    	date_default_timezone_set('America/Lima');
        header('Access-Control-Allow-Origin: *');
        header("Access-Control-Allow-Headers: Origin, X-Requested-With, Content-Type, Accept");
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE');
    }

    public function validaAccesoCustomer($JSON, $register = ''){
    	if($JSON->empresa->ruc != ''){
    	$customer = $this->db->from('customers')
    			             ->where('ruc',$JSON->empresa->ruc)    			            
    			 			 ->get()
    			     	 	 ->row();


    	$fecha_desde = date("Y-m-d");				
		$fecha_hasta = date("Y-m-d",strtotime($fecha_desde."+ 1 year"));
    	//var_dump($customer);    	

    	if(empty($customer)){
    		$data = array('ruc' => $JSON->empresa->ruc,
    				  'razon_social' => $JSON->empresa->razon_social,
    				  'direccion' => $JSON->empresa->direccion,
    				  'urbanizacion' => $JSON->empresa->urbanizacion,    				  
    				  'fecha_desde' => $fecha_desde,
    				  'fecha_hasta' => $fecha_hasta,		  
    				  'estado' => 'activo');

    		if(isset($JSON->empresa->telefono_fijo))
    			$data = array_merge($data, array('telefono_fijo' => $JSON->empresa->telefono_fijo));	
			if(isset($JSON->empresa->telefono_movil))
				$data = array_merge($data, array('telefono_movil' => $JSON->empresa->telefono_movil));
			if(isset($JSON->empresa->correo))
				$data = array_merge($data, array('correo' => $JSON->empresa->correo));
			if(isset($JSON->empresa->acceso_guia))
				$data = array_merge($data, array('acceso_guia' => $JSON->empresa->acceso_guia));

			$this->db->insert('customers', $data);
			return true;
    	} else {
    		$data = array('ruc' => $JSON->empresa->ruc,
    				  'razon_social' => $JSON->empresa->razon_social,
    				  'direccion' => $JSON->empresa->direccion,
    				  'urbanizacion' => $JSON->empresa->urbanizacion);    				  

    		if(isset($JSON->empresa->telefono_fijo))
    			$data = array_merge($data, array('telefono_fijo' => $JSON->empresa->telefono_fijo));	
			if(isset($JSON->empresa->telefono_movil))
				$data = array_merge($data, array('telefono_movil' => $JSON->empresa->telefono_movil));
			if(isset($JSON->empresa->correo))
				$data = array_merge($data, array('correo' => $JSON->empresa->correo));
			if(isset($JSON->empresa->acceso_guia))
				$data = array_merge($data, array('acceso_guia' => $JSON->empresa->acceso_guia));

    		$this->db->where('id', $customer->id);
    		$this->db->update('customers',$data);
    		    		
			if($register == ''){
				/* if(($customer->estado !== "activo") || (date('Y-m-d') > $customer->fecha_hasta)){				 	
				 	$response['res'] = 0; 
	      	 		$response['msg'] = 'Error al generar XML, comunicarse con el Soporte Técnico 922808929';
				 	echo json_encode($response);
				 	exit();
				}*/
				$diffDias = (date_diff(date_create(date('Y-m-d')),date_create($customer->fecha_hasta)))->days;				
				if($customer->fecha_hasta >= date('Y-m-d')){
					if($diffDias <= 7){
					$this->session->set_flashdata('mensaje','<br><b><div style="background-color: #FF3342;color=#000000;font-size:12px";>Estimado Cliente le quedan '.$diffDias.' días para finalización el periodo de mantenimiento, comunicarse con el Soporte Técnico 922808929</b></div>');    	 						 	
					}
				}elseif(($customer->estado !== 'activo') || (date('Y-m-d') > $customer->fecha_hasta)){
					$response['res'] = 0; 
	      	 		$response['msg'] = 'Error al generar XML, comunicarse con el Soporte Técnico 922808929';
				 	echo json_encode($response);
				 	exit();
				}
			}	
			return true;		 						
    	}}else {
    		exit();
    	}
    }


    public function register_CERT()
    {  
    	$raiz = $_SERVER['DOCUMENT_ROOT'];
	    $ruc = $_POST['ruc'];
	    $pass = $_POST['pass_certificado'];
    	$archivo = $_FILES['certificado']['tmp_name'];

    	$JSON->empresa->ruc = $_POST['ruc'];
    	$JSON->empresa->razon_social = $_POST['empresa'];
    	$JSON->empresa->direccion = $_POST['domicilio_fiscal'];
    	$JSON->empresa->urbanizacion = $_POST['urb'];
    	$JSON->empresa->telefono_fijo = $_POST['telefono_fijo'];
    	$JSON->empresa->telefono_movil = $_POST['telefono_movil'];
    	$JSON->empresa->correo = $_POST['correo'];
		    	$carpetaPRINCIPAL = $raiz .'/MUNDOSOFTPERUSUNAT/sfs/'.$ruc;
		        $carpetaCERT = $raiz .'/MUNDOSOFTPERUSUNAT/sfs/'.$ruc.'/CERT/';
		    	$carpetaXML = $raiz .'/MUNDOSOFTPERUSUNAT/sfs/'.$ruc.'/XML/';
		    	$carpetaCDR = $raiz .'/MUNDOSOFTPERUSUNAT/sfs/'.$ruc.'/CDR/'; 

		        if (!file_exists($carpetaPRINCIPAL)) {
		    	    mkdir($carpetaCERT, 0700,true);
		            mkdir($carpetaXML, 0700,true);
		            mkdir($carpetaCDR, 0700,true);   
				}
		        
		        $destino = $carpetaCERT.$ruc.'.pfx';
		        copy($archivo, $destino);
	        }

	        $response = $this->convertoPEM($ruc,$pass);
            echo $response;
    }
   
    public function convertoPEM($ruc,$pass)
	{
		require 'vendor/autoload.php';
		if(is_file('sfs/'.$ruc.'/CERT/'.$ruc.'.pfx')){  
	      try{
			$pfx = file_get_contents('sfs/'.$ruc.'/CERT/'.$ruc.'.pfx');
			$password = $pass;

			$certificate = new X509Certificate($pfx, $password);
			$pem = $certificate->export(X509ContentType::PEM);
			    
			file_put_contents('sfs/'.$ruc.'/CERT/'.$ruc.'.pem', $pem);
			 return 1;
	      }catch(Exception $e){
	      	 return 0;
	      }	
	    }else{
	    	return 3;
	{
		if(is_file('sfs/'.$ruc.'/CERT/'.$ruc.'.pem')){
					$see->setService(SunatEndpoints::FE_PRODUCCION);
					break;
				case '2'://PSE PRODUCCIÓN
					$see->setService(SunatEndpoints::FE_PRODUCCION_PSE);
			$see->setCertificate(file_get_contents('sfs/'.$ruc.'/CERT/'.$ruc.'.pem'));
			$see->setCredentials($ruc.$user,$pass);
			return $see;

	//API GRE 12012023 //ALEXANDER FERNÁNDEZ
	public function configGRE($ruc,$user,$pass,$client_id,$client_secret)
	{
			$api = new \Greenter\Api([
	            'auth' => 'https://api-seguridad.sunat.gob.pe/v1',
	            'cpe' => 'https://api-cpe.sunat.gob.pe/v1',
	            //'auth' => 'https://gre-test.nubefact.com/v1',
	            //'cpe' => 'https://gre-test.nubefact.com/v1',
	        ]);

	        $certificate = file_get_contents('sfs/'.$ruc.'/CERT/'.$ruc.'.pem');			

	        return $api->setBuilderOptions([
	                'strict_variables' => true,
	                'optimizations' => 0,
	                'debug' => true,
	                'cache' => false,
	            ])
	            //->setApiCredentials('test-85e5b0ae-255c-4891-a595-0b98c65c9854', 'test-Hty/M6QshYvPgItX2P0+Kw==')
	        	->setApiCredentials($client_id, $client_secret)

		}	else{ $response['res'] = 0; 
	    }		    	
	}

	public function generate_xml()
	{
	   $JSON = json_decode($_POST['datosJSON']);
	   $this->validaAccesoCustomer($JSON);
	   	$this->generate_xml_FXB($JSON);
	   }
    
	{
	   $JSON = json_decode($_POST['datosJSON']);
	   $this->validaAccesoCustomer($JSON);
	   if($JSON->cabecera->tipo_documento == '07' or $JSON->cabecera->tipo_documento == '08'){
	//RESUMEN DIARIO BOLETAS 20-10-2020
	public function send_resumenDiario(){
	    $JSON = json_decode($_POST['datosJSON']); 
	    $this->validaAccesoCustomer($JSON);
	    $this->send_resumenDiarioBoleta($JSON);
	}

	public function send_anulacion()
	{
	   	$this->send_ComunicacionBaja($JSON);
	   }
    
	}

	public function generate_xml_FXB($JSON)
	{ 
		require './vendor/autoload.php';
		$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);			 

        // Cliente
		$client = new Client();
		$client->setTipoDoc($JSON->cliente->tipo_documento)
		       ->setNumDoc($JSON->cliente->ruc)
		       ->setRznSocial($JSON->cliente->razon_social);

		// Emisor
		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);
        
        ///VENTA
		$invoice = new Invoice();
		$invoice->setUblVersion('2.1')
			    ->setTipoOperacion($JSON->cabecera->tipo_operacion) // Catalog. 51
			    ->setTipoDoc($JSON->cabecera->tipo_documento)
			    ->setSerie($JSON->cabecera->serie)
			    ->setCorrelativo($JSON->cabecera->numero)
			    ->setFechaEmision(new DateTime($JSON->cabecera->fecha_emision))
			    ->setTipoMoneda($JSON->cabecera->tipo_moneda)
			    ->setClient($client)
			    ->setCompany($company)
			    ->setMtoIGV($JSON->cabecera->igv)
			    ->setTotalImpuestos($JSON->cabecera->impuestos)
			    //->setValorVenta($JSON->cabecera->valor_venta)
			    ->setValorVenta(round(($JSON->cabecera->importe_venta - $JSON->cabecera->igv),2))
			    ->setSubTotal($JSON->cabecera->importe_venta)
			    ->setMtoImpVenta($JSON->cabecera->importe_venta);

			//DESCUENTO GLOBAL - //cambio 19-10-2021
			if(isset($JSON->cabecera->descuentoGlobal) && $JSON->cabecera->descuentoGlobal>0){			    			
			$montoBase = number_format($JSON->cabecera->importe_venta+$JSON->cabecera->descuentoGlobal,2);
			$descuento = number_format($JSON->cabecera->descuentoGlobal,2);

			$invoice->setDescuentos([
       				 (new Charge())
            		->setCodTipo('02') // Catalog. 53
            		->setMontoBase($montoBase)
            		->setFactor(number_format($descuento/$montoBase,2))
            		->setMonto($descuento)
    				]); 
			}   

			//OPERACIONES GRATUITAS			
			if(isset($JSON->cabecera->gratuitas) && $JSON->cabecera->gratuitas>0)
			    $invoice->setMtoOperGratuitas($JSON->cabecera->gratuitas);   


			//ACTUALIZACIÓN FORMA DE PAGO 27/08/2021			
			//FORMA DE PAGO - CRÉDITO
			if(isset($JSON->Pago->FormaPago) && ($JSON->Pago->FormaPago == 'Credito')){
					$invoice->setFormaPago(new FormaPagoCredito($JSON->Pago->Monto));
					//CUOTAS							
					foreach ($JSON->detalle_pagos as $detalle_pago) {						
							$item_p = new Cuota();
							$item_p ->setMonto($detalle_pago->monto)			
									->setFechaPago(new DateTime($detalle_pago->fecha_cuota));																				
							$item_pp[] =  $item_p;							
					}						
					$invoice->setCuotas($item_pp);					
			} else {
				$invoice->setFormaPago(new FormaPagoContado());		
			}
			//DETRACCION 23/12/2021
			if(isset($JSON->Detraccion->Estado) && ($JSON->Detraccion->Estado == 'on')){
				$invoice->setDetraccion(
					    // MONEDA SIEMPRE EN SOLES
					        (new Detraction())
					            ->setCodBienDetraccion($JSON->Detraccion->CodigoDetraccion) // catalog. 54					            
					            ->setCodMedioPago($JSON->Detraccion->CodigoMedioPago) // catalog. 59
					            ->setCtaBanco($JSON->Detraccion->NumeroCuentaDetraccion)
					            ->setPercent($JSON->Detraccion->PorcentajeDetraccion)
					            ->setMount($JSON->Detraccion->TotalDetraccion)
					    );
			}

			if($JSON->cabecera->tipo_operacion == '0200'){
				$invoice->setMtoOperExportacion($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->inafectas>0){
				$invoice->setMtoOperInafectas($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->exoneradas>0){
				$invoice->setMtoOperExoneradas($JSON->cabecera->exoneradas);
				// SMITH FERNANDEZ CAHUANA 13/05/2022 PARA ENVIAR ITEMS CON IGV EXONERADAS Y GRAVADAS
				$invoice->setMtoOperGravadas($JSON->cabecera->gravadas);
			}else{
                $invoice->setMtoOperGravadas($JSON->cabecera->gravadas);
			}

			if($JSON->cabecera->icbper>0){
				$invoice->setIcbper($JSON->cabecera->icbper);
			}    

        
        foreach($JSON->detalle as $detalle){
			$item_i = new SaleDetail();
			$item_i ->setCodProdSunat($detalle->sunat)
			        ->setCodProducto($detalle->codigo)
				    ->setUnidad($detalle->unidad)
				    ->setCantidad($detalle->cantidad)
				    ->setDescripcion($detalle->descripcion)
				    ->setMtoBaseIgv($detalle->base)
				    ->setPorcentajeIgv(18.00) // 18%
				    ->setIgv($detalle->igv)
				    ->setTipAfeIgv($detalle->tipo_igv)
				    ->setTotalImpuestos($detalle->impuestos)
				    ->setMtoValorVenta($detalle->valor_venta)
				    ->setMtoValorUnitario($detalle->valor_unitario)
				    ->setMtoPrecioUnitario($detalle->precio_unitario);

				//OPERACION GRATUITA
				if(isset($detalle->gratuitas) && $detalle->gratuitas > 0){					
					 $item_i->setMtoValorGratuito($detalle->gratuitas);
				}				    
				//DESCUENTOS UNITARIOS
				if(isset($detalle->descuento) && $detalle->descuento > 0){
					if($detalle->precio_unitario > 0){
						$montoBase = round($detalle->cantidad*$detalle->precio_unitario,2);
						$descuento = round($detalle->cantidad*$detalle->descuento,2);
					}else{
						$montoBase = $detalle->descuento;
						$descuento = $detalle->descuento;
					}
					$item_i->setDescuentos([
						        (new Charge())
						            ->setCodTipo('00') // Catalog. 53
						            ->setMontoBase($montoBase)
						            ->setFactor(round($descuento/$montoBase,2))
						            ->setMonto($descuento)
    					]);
				}    


			    if($detalle->icbper == 'on'){
			    	$item_i->setCantidad(intval($detalle->cantidad))
			    	       ->setIcbper($detalle->igv_icbper) // (cantidad)*(factor ICBPER)
                           ->setFactorIcbper($detalle->valor_icbper);
			    }

			$item[] =  $item_i;   
	    }		    

	    //var_dump($item);exit;

		$legend = (new Legend())
		    ->setCode('1000')
		    ->setValue($JSON->letra);		

		$invoice->setDetails($item)
		        ->setLegends([$legend]);

		//OPERACION GRATUITA - LEYENDA
		//if(isset($JSON->cabecera->gratuitas) && $JSON->cabecera->gratuitas>0){
		//$invoice->setLegends([
        //	(new Legend())
        //    ->setCode('1002')
        //    ->setValue('TRANSFERENCIA GRATUITA DE UN BIEN Y/O SERVICIO PRESTADO GRATUITAMENTE')
    	//	]);            
		//}

        $response = [];
		try{
            ////GENERA XML
			$result = $see->getXmlSigned($invoice);
			// Guardar XML
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$invoice->getName().'.xml',$see->getFactory()->getLastXml());

         $response['res'] = 1; 
	     $response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));
		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);


            
    }

    public function generate_xml_NCXND($JSON)
    {
    	require './vendor/autoload.php';
    	$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);		

		$client = new Client();
		$client->setTipoDoc($JSON->cliente->tipo_documento)
		       ->setNumDoc($JSON->cliente->ruc)
		       ->setRznSocial($JSON->cliente->razon_social);

		// Emisor
		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		$note = new Note();
		$note
		    ->setUblVersion('2.1')
		    ->setTipDocAfectado($JSON->adjunto->tipo_documento)
		    ->setNumDocfectado($JSON->adjunto->serie.'-'.$JSON->adjunto->numero)
		    ->setCodMotivo($JSON->cabecera->cod_motivo)
		    ->setDesMotivo($JSON->cabecera->des_motivo)
		    ->setTipoDoc($JSON->cabecera->tipo_documento)
		    ->setSerie($JSON->cabecera->serie)
		    ->setFechaEmision(new DateTime($JSON->cabecera->fecha_emision))
		    ->setCorrelativo($JSON->cabecera->numero)
		    ->setTipoMoneda($JSON->cabecera->tipo_moneda)
		    ->setGuias([/* Guias (Opcional) */
		       // (new Document())
		        //->setTipoDoc('09')
		        //->setNroDoc('001-213')
		    ])
		    ->setCompany($company)
		    ->setClient($client)		    
		    ->setMtoIGV($JSON->cabecera->impuestos)
		    ->setTotalImpuestos($JSON->cabecera->impuestos)
		    ->setMtoImpVenta($JSON->cabecera->importe_venta);    

		    //DESCUENTO GLOBAL - //cambio 19-10-2021
			if(isset($JSON->cabecera->descuentoGlobal) && $JSON->cabecera->descuentoGlobal>0){			    			
			$montoBase = number_format($JSON->cabecera->importe_venta+$JSON->cabecera->descuentoGlobal,2);
			$descuento = number_format($JSON->cabecera->descuentoGlobal,2);

			$invoice->setDescuentos([
       				 (new Charge())
            		->setCodTipo('02') // Catalog. 53
            		->setMontoBase($montoBase)
            		->setFactor(number_format($descuento/$montoBase,2))
            		->setMonto($descuento)
    				]); 
			}

			//OPERACIONES GRATUITAS			
			if(isset($JSON->cabecera->gratuitas) && $JSON->cabecera->gratuitas>0)
			    $note->setMtoOperGratuitas($JSON->cabecera->gratuitas);

			//FORMA DE PAGO
			if(isset($JSON->Pago->FormaPago) && ($JSON->Pago->FormaPago == 'Credito')){
					$note->setFormaPago(new FormaPagoCredito($JSON->Pago->Monto));
					//CUOTAS							
					foreach ($JSON->detalle_pagos as $detalle_pago) {						
							$item_p = new Cuota();
							$item_p ->setMonto($detalle_pago->monto)			
									->setFechaPago(new DateTime($detalle_pago->fecha_cuota));																				
							$item_pp[] =  $item_p;							
					}						
					$note->setCuotas($item_pp);					
			} else {
				$note->setFormaPago(new FormaPagoContado());		
			}

			if($JSON->cabecera->tipo_operacion == '0200'){
				$note->setMtoOperExportacion($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->inafectas>0){
				$note->setMtoOperInafectas($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->exoneradas>0){
				$note->setMtoOperExoneradas($JSON->cabecera->exoneradas);
			}else{
                $note->setMtoOperGravadas($JSON->cabecera->gravadas);
			}

		 foreach($JSON->detalle as $detalle){

		 	$item_i = new SaleDetail();
			$item_i ->setCodProdSunat($detalle->sunat)
			        ->setCodProducto($detalle->codigo)
				    ->setUnidad($detalle->unidad)
				    ->setCantidad($detalle->cantidad)
				    ->setDescripcion($detalle->descripcion)
				    ->setMtoBaseIgv($detalle->base)
				    ->setPorcentajeIgv($detalle->porcentaje_igv) // 18%
				    ->setIgv($detalle->igv)
				    ->setTipAfeIgv($detalle->tipo_igv)
				    ->setTotalImpuestos($detalle->impuestos)
				    ->setMtoValorVenta($detalle->valor_venta)
				    ->setMtoValorUnitario($detalle->valor_unitario)
				    ->setMtoPrecioUnitario($detalle->precio_unitario);


				//OPERACION GRATUITA
				if(isset($detalle->gratuitas) && $detalle->gratuitas > 0){					
					 $item_i->setMtoValorGratuito($detalle->gratuitas);
				}				    
				//DESCUENTOS UNITARIOS
				if(isset($detalle->descuento) && $detalle->descuento > 0){
					if($detalle->precio_unitario > 0){
						$montoBase = number_format($detalle->cantidad*$detalle->precio_unitario,2);
						$descuento = number_format($detalle->cantidad*$detalle->descuento,2);
					}else{
						$montoBase = $detalle->descuento;
						$descuento = $detalle->descuento;
					}
					$item_i->setDescuentos([
						        (new Charge())
						            ->setCodTipo('00') // Catalog. 53
						            ->setMontoBase($montoBase)
						            ->setFactor(number_format($descuento/$montoBase,2))
						            ->setMonto($descuento)
    					]);
				}

			    if($detalle->icbper == 'on'){
			    	$item_i->setCantidad(intval($detalle->cantidad))
			    	       ->setIcbper($detalle->igv_icbper) // (cantidad)*(factor ICBPER)
                           ->setFactorIcbper($detalle->valor_icbper);
			    }

			$item[] =  $item_i;   			
	    }		    

		$legend = (new Legend())
		    ->setCode('1000')
		    ->setValue($JSON->letra);

		$note->setDetails($item)
             ->setLegends([$legend]);   

        $response = [];
		try{
            ////GENERA XML
			$result = $see->getXmlSigned($note);
			// Guardar XML
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$note->getName().'.xml',$see->getFactory()->getLastXml());

         $response['res'] = 1; 
	     $response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));
		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);     
    }

    public function send_xml_FXB($JSON)
	{ 
		require './vendor/autoload.php';

		$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);

        // Cliente
		$client = new Client();
		$client->setTipoDoc($JSON->cliente->tipo_documento)
		       ->setNumDoc($JSON->cliente->ruc)
		       ->setRznSocial($JSON->cliente->razon_social);

		// Emisor
		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		$invoice = new Invoice();
		$invoice->setUblVersion('2.1')
			    ->setTipoOperacion($JSON->cabecera->tipo_operacion) // Catalog. 51
			    ->setTipoDoc($JSON->cabecera->tipo_documento)
			    ->setSerie($JSON->cabecera->serie)
			    ->setCorrelativo($JSON->cabecera->numero)
			    ->setFechaEmision(new DateTime($JSON->cabecera->fecha_emision))
			    ->setTipoMoneda($JSON->cabecera->tipo_moneda)
			    ->setClient($client)
			    ->setCompany($company)
			    ->setMtoIGV($JSON->cabecera->igv)
			    ->setTotalImpuestos($JSON->cabecera->impuestos)
			    //->setValorVenta($JSON->cabecera->valor_venta)			    
			    ->setValorVenta(round(($JSON->cabecera->importe_venta - $JSON->cabecera->igv),2))
			    ->setSubTotal($JSON->cabecera->importe_venta)
			    ->setMtoImpVenta($JSON->cabecera->importe_venta);

			//OBSERVACIONES//ALEXANDER FERNÁNDEZ 15-10-2021
			if(isset($JSON->cabecera->observaciones))
				    $invoice->setObservacion($JSON->cabecera->observaciones);
			
			//DESCUENTO GLOBAL - //cambio 19-10-2021
			if(isset($JSON->cabecera->descuentoGlobal) && $JSON->cabecera->descuentoGlobal>0){			    			
			$montoBase = number_format($JSON->cabecera->importe_venta+$JSON->cabecera->descuentoGlobal,2);
			$descuento = number_format($JSON->cabecera->descuentoGlobal,2);

			$invoice->setDescuentos([
       				 (new Charge())
            		->setCodTipo('02') // Catalog. 53
            		->setMontoBase($montoBase)
            		->setFactor(number_format($descuento/$montoBase,2))
            		->setMonto($descuento)
    				]); 
			}   
			//OPERACIONES GRATUITAS			
			if(isset($JSON->cabecera->gratuitas) && $JSON->cabecera->gratuitas>0)
				    $invoice->setMtoOperGratuitas($JSON->cabecera->gratuitas);  


			//FORMA DE PAGO
			if(isset($JSON->Pago->FormaPago) && ($JSON->Pago->FormaPago == 'Credito')){
					$invoice->setFormaPago(new FormaPagoCredito($JSON->Pago->Monto));
					//CUOTAS							
					foreach ($JSON->detalle_pagos as $detalle_pago) {						
							$item_p = new Cuota();
							$item_p ->setMonto($detalle_pago->monto)			
									->setFechaPago(new DateTime($detalle_pago->fecha_cuota));																				
							$item_pp[] =  $item_p;							
					}						
					$invoice->setCuotas($item_pp);					
			} else {
				$invoice->setFormaPago(new FormaPagoContado());		
			}

			 //RETENCION 13/04/2022 FERNANDEZ SMITH
			if(isset($JSON->Retencion->Estado) && ($JSON->Retencion->Estado == 'on')){
				$porcentaje_retencion = number_format($JSON->Retencion->PorcentajeRetencion/100,2);
				$invoice->setDescuentos([
       				 (new Charge())
            		->setCodTipo('62') // Catalog. 53
            		->setMontoBase($JSON->cabecera->importe_venta)
            		->setFactor($porcentaje_retencion)
            		->setMonto($JSON->Retencion->TotalRetencion)
    				]);			    	
               }

			//DETRACCION 23/12/2021
			if(isset($JSON->Detraccion->Estado) && ($JSON->Detraccion->Estado == 'on')){
				$invoice->setDetraccion(
					    // MONEDA SIEMPRE EN SOLES
					        (new Detraction())
					            ->setCodBienDetraccion($JSON->Detraccion->CodigoDetraccion) // catalog. 54					            
					            ->setCodMedioPago($JSON->Detraccion->CodigoMedioPago) // catalog. 59
					            ->setCtaBanco($JSON->Detraccion->NumeroCuentaDetraccion)
					            ->setPercent($JSON->Detraccion->PorcentajeDetraccion)
					            ->setMount($JSON->Detraccion->TotalDetraccion)
					    );
			}

            if($JSON->cabecera->tipo_operacion == '0200'){
				$invoice->setMtoOperExportacion($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->inafectas>0){
				$invoice->setMtoOperInafectas($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->exoneradas>0){
				$invoice->setMtoOperExoneradas($JSON->cabecera->exoneradas);
				 // SMITH FERNANDEZ CAHUANA 13/05/2022 PARA ENVIAR ITEMS CON IGV EXONERADAS Y GRAVADAS
				$invoice->setMtoOperGravadas($JSON->cabecera->gravadas);
			}else{
                $invoice->setMtoOperGravadas($JSON->cabecera->gravadas);

			}  

			if($JSON->cabecera->icbper>0){
				$invoice->setIcbper($JSON->cabecera->icbper);
			}    

        
        foreach($JSON->detalle as $detalle){
			$item_i = new SaleDetail();
			$item_i ->setCodProdSunat($detalle->sunat)
			        ->setCodProducto($detalle->codigo)
				    ->setUnidad($detalle->unidad)
				    ->setCantidad($detalle->cantidad)
				    ->setDescripcion($detalle->descripcion)
				    ->setMtoBaseIgv($detalle->base)
				    ->setPorcentajeIgv($detalle->porcentaje_igv) // 18%
				    ->setIgv($detalle->igv)
				    ->setTipAfeIgv($detalle->tipo_igv)
				    ->setTotalImpuestos($detalle->impuestos)
				    ->setMtoValorVenta($detalle->valor_venta)
				    ->setMtoValorUnitario($detalle->valor_unitario)
				    ->setMtoPrecioUnitario($detalle->precio_unitario);


				//OPERACION GRATUITA
				if(isset($detalle->gratuitas) && $detalle->gratuitas > 0){					
					 $item_i->setMtoValorGratuito($detalle->gratuitas);
				}				    
				//DESCUENTOS UNITARIOS
				if(isset($detalle->descuento) && $detalle->descuento > 0){
					if($detalle->precio_unitario > 0){
						$montoBase = number_format($detalle->cantidad*$detalle->precio_unitario,2);
						$descuento = number_format($detalle->cantidad*$detalle->descuento,2);
					}else{
						$montoBase = $detalle->descuento;
						$descuento = $detalle->descuento;
					}
					$item_i->setDescuentos([
						        (new Charge())
						            ->setCodTipo('00') // Catalog. 53
						            ->setMontoBase($montoBase)
						            ->setFactor(number_format($descuento/$montoBase,2))
						            ->setMonto($descuento)
    					]);
				}

			    if($detalle->icbper == 'on'){
			    	$item_i->setCantidad(intval($detalle->cantidad))
			    	       ->setIcbper($detalle->igv_icbper) // (cantidad)*(factor ICBPER)
                           ->setFactorIcbper($detalle->valor_icbper);
			    }

			$item[] =  $item_i;   
	    }	

		//LEGENDA 01/07
		$legenda =  (new Legend())
							->setCode('1000')
					 		->setValue($JSON->letra);				 
		$legend[] = $legenda;

		if ($JSON->Detraccion->Estado == 'on') {
				$legenda =  (new Legend())
							->setCode('2006')
					 		->setValue('Operación sujeta a detracción');			 
				$legend[] = $legenda;
		}		

		$invoice->setDetails($item)
			    ->setLegends($legend);

        $response = [];
		try{
            ////ENVIAR SUNAT
			$result = $see->send($invoice);
			if (!$result->isSuccess()) {			   			   
			   if ($result->getError()->getCode() == 1033) {//COMPROBANTE YA HA SIDO ENVIADO
			   		
			   		$wsdlUrl = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl';
					$soap = new SoapClient($wsdlUrl);
					
					$soap->setCredentials($JSON->empresa->ruc.$JSON->empresa->user,$JSON->empresa->pass);
					$service = new ConsultCdrService();
					$service->setClient($soap);

			   		$response['res'] = 1;
               		$response['msg'] = "COMPROBANTE YA SE ENCUENTRA REGISTRADO <br>[code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage();
	           		$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));	           			          
	           		$result = $service->getStatusCdr($JSON->empresa->ruc, $JSON->cabecera->tipo_documento, $JSON->cabecera->serie, $JSON->cabecera->numero);
	           		//var_dump($result);exit;
	           		$cdr = $result->getCdrResponse();
					if ($cdr === null) {
					    echo 'CDR no encontrado, el comprobante no ha sido comunicado a SUNAT.';
					    return;
					}
	           		file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$invoice->getName().'.zip', $result->getCdrZip());
	           		echo json_encode($response);
			   } else {
			   		print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage());	
			   }			   
			   exit(); 
			}

			//VALIDACION DE CODIGOS DE ERRORES
			$cdr = $result->getCdrResponse();
			$code = (int)$cdr->getCode();
			$response['res'] = 1;
			
			if ($code === 0) {
			    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
	            $response['res'] = 1;
				} else if ($code >= 4000) {
				    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
				    //var_dump($cdr->getNotes());				    
				    $response['res'] = 1;
					} else if ($code >= 2000 && $code <= 3999) {
			    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
			    		$response['res'] = 0;			    		
						} else {
						    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
						    /*code: 0100 a 1999 */
						    //echo 'Excepción';
						    $response['res'] = 0;			    			
						}	

			// Guardar XML
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$invoice->getName().'.xml',$see->getFactory()->getLastXml());
			// GUARDAR CDR
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$invoice->getName().'.zip', $result->getCdrZip());
            
            $response['msg'] = $result->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
	        $response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));
		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);

    }

     public function send_xml_NCXND($JSON)
	{ 
		require './vendor/autoload.php';
		$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);		

		$client = new Client();
		$client->setTipoDoc($JSON->cliente->tipo_documento)
		       ->setNumDoc($JSON->cliente->ruc)
		       ->setRznSocial($JSON->cliente->razon_social);

		// Emisor
		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);    		    		    

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		$note = new Note();
		$note
		    ->setUblVersion('2.1')
		    ->setTipDocAfectado($JSON->adjunto->tipo_documento)
		    ->setNumDocfectado($JSON->adjunto->serie.'-'.$JSON->adjunto->numero)
		    ->setCodMotivo($JSON->cabecera->cod_motivo)
		    ->setDesMotivo($JSON->cabecera->des_motivo)
		    ->setTipoDoc($JSON->cabecera->tipo_documento)
		    ->setSerie($JSON->cabecera->serie)
		    ->setFechaEmision(new DateTime($JSON->cabecera->fecha_emision))
		    ->setCorrelativo($JSON->cabecera->numero)
		    ->setTipoMoneda($JSON->cabecera->tipo_moneda)
		    ->setGuias([/* Guias (Opcional) */
		       // (new Document())
		        //->setTipoDoc('09')
		        //->setNroDoc('001-213')
		    ])
		    ->setCompany($company)
		   	->setClient($client)
		    ->setMtoIGV($JSON->cabecera->impuestos)
		    ->setTotalImpuestos($JSON->cabecera->impuestos)
		    ->setMtoImpVenta($JSON->cabecera->importe_venta);    


		    //OBSERVACIONES//ALEXANDER FERNÁNDEZ 15-10-2021
			//if(isset($JSON->cabecera->observaciones))
				    //$note->setObservacion($JSON->cabecera->observaciones);
		    //DESCUENTO GLOBAL - //cambio 19-10-2021
			if(isset($JSON->cabecera->descuentoGlobal) && $JSON->cabecera->descuentoGlobal>0){			    			
			$montoBase = number_format($JSON->cabecera->importe_venta+$JSON->cabecera->descuentoGlobal,2);
			$descuento = number_format($JSON->cabecera->descuentoGlobal,2);

			$invoice->setDescuentos([
       				 (new Charge())
            		->setCodTipo('02') // Catalog. 53
            		->setMontoBase($montoBase)
            		->setFactor(number_format($descuento/$montoBase,2))
            		->setMonto($descuento)
    				]); 
			}
			//OPERACIONES GRATUITAS			
			if(isset($JSON->cabecera->gratuitas) && $JSON->cabecera->gratuitas>0)
				    $note->setMtoOperGratuitas($JSON->cabecera->gratuitas);  

			//FORMA DE PAGO
			if(isset($JSON->Pago->FormaPago) && ($JSON->Pago->FormaPago == 'Credito')){
					$note->setFormaPago(new FormaPagoCredito($JSON->Pago->Monto));
					//CUOTAS							
					foreach ($JSON->detalle_pagos as $detalle_pago) {						
							$item_p = new Cuota();
							$item_p ->setMonto($detalle_pago->monto)			
									->setFechaPago(new DateTime($detalle_pago->fecha_cuota));																				
							$item_pp[] =  $item_p;							
					}						
					$note->setCuotas($item_pp);					
			} //else {
				//$note->setFormaPago(new FormaPagoContado());		
			//}

            if($JSON->cabecera->tipo_operacion == '0200'){
				$note->setMtoOperExportacion($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->inafectas>0){
				$note->setMtoOperInafectas($JSON->cabecera->inafectas);
			}else if($JSON->cabecera->exoneradas>0){
				$note->setMtoOperExoneradas($JSON->cabecera->exoneradas);
			}else{
                $note->setMtoOperGravadas($JSON->cabecera->gravadas);
			}  

			if($JSON->cabecera->icbper>0){
				$note->setIcbper($JSON->cabecera->icbper);
			}    


		 foreach($JSON->detalle as $detalle){

		 	$item_i = new SaleDetail();
			$item_i ->setCodProdSunat($detalle->sunat)
			        ->setCodProducto($detalle->codigo)
				    ->setUnidad($detalle->unidad)
				    ->setCantidad($detalle->cantidad)
				    ->setDescripcion($detalle->descripcion)
				    ->setMtoBaseIgv($detalle->base)
				    ->setPorcentajeIgv($detalle->porcentaje_igv) // 18%
				    ->setIgv($detalle->igv)
				    ->setTipAfeIgv($detalle->tipo_igv)
				    ->setTotalImpuestos($detalle->impuestos)
				    ->setMtoValorVenta($detalle->valor_venta)
				    ->setMtoValorUnitario($detalle->valor_unitario)
				    ->setMtoPrecioUnitario($detalle->precio_unitario);


				//OPERACION GRATUITA
				if(isset($detalle->gratuitas) && $detalle->gratuitas > 0){					
					 $item_i->setMtoValorGratuito($detalle->gratuitas);
				}				    
				//DESCUENTOS UNITARIOS
				if(isset($detalle->descuento) && $detalle->descuento > 0){
					if($detalle->precio_unitario > 0){
						$montoBase = number_format($detalle->cantidad*$detalle->precio_unitario,2);
						$descuento = number_format($detalle->cantidad*$detalle->descuento,2);
					}else{
						$montoBase = $detalle->descuento;
						$descuento = $detalle->descuento;
					}
					$item_i->setDescuentos([
						        (new Charge())
						            ->setCodTipo('00') // Catalog. 53
						            ->setMontoBase($montoBase)
						            ->setFactor(number_format($descuento/$montoBase,2))
						            ->setMonto($descuento)
    					]);
				}

			    if($detalle->icbper == 'on'){
			    	$item_i->setCantidad(intval($detalle->cantidad))
			    	       ->setIcbper($detalle->igv_icbper) // (cantidad)*(factor ICBPER)
                           ->setFactorIcbper($detalle->valor_icbper);
			    }

			$item[] =  $item_i;   			
	    }		    

		$legend = (new Legend())
		    ->setCode('1000')
		    ->setValue($JSON->letra);

		$note->setDetails($item)
             ->setLegends([$legend]);


        $response = [];
		try{
            ////ENVIAR SUNAT
			$result = $see->send($note);
			if (!$result->isSuccess()) {
				if ($result->getError()->getCode() == 1033) {//COMPROBANTE YA HA SIDO ENVIADO
					$wsdlUrl = 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl';
					$soap = new SoapClient($wsdlUrl);
					
					$soap->setCredentials($JSON->empresa->ruc.$JSON->empresa->user,$JSON->empresa->pass);
					$service = new ConsultCdrService();
					$service->setClient($soap);

			   		$response['res'] = 1; 
               		$response['msg'] = "COMPROBANTE YA SE ENCUENTRA REGISTRADO <br>[code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage();
	           		$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));	           			          
	           		$result = $service->getStatusCdr($JSON->empresa->ruc, $JSON->cabecera->tipo_documento, $JSON->cabecera->serie, $JSON->cabecera->numero);
	           		//var_dump($result);exit;
	           		$cdr = $result->getCdrResponse();
					if ($cdr === null) {
					    echo 'CDR no encontrado, el comprobante no ha sido comunicado a SUNAT.';
					    return;
					}
	           		file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$note->getName().'.zip', $result->getCdrZip());			   		
	           		echo json_encode($response);
			   } else {
			   		print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage());	
			   }			   
			   exit(); 			   
			}


			//VALIDACION DE CODIGOS DE ERRORES
			$cdr = $result->getCdrResponse();
			$code = (int)$cdr->getCode();
			$response['res'] = 1;
			
			if ($code === 0) {
			    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
	            $response['res'] = 1;
				} else if ($code >= 4000) {
				    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
				    //var_dump($cdr->getNotes());				    
				    $response['res'] = 1;
					} else if ($code >= 2000 && $code <= 3999) {
			    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
			    		$response['res'] = 0;			    		
						} else {
						    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
						    /*code: 0100 a 1999 */
						    //echo 'Excepción';
						    $response['res'] = 0;			    			
						}	


			// Guardar XML
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$note->getName().'.xml',$see->getFactory()->getLastXml());
			// GUARDAR CDR
			file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$note->getName().'.zip', $result->getCdrZip());            
            $response['msg'] = $result->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
	        $response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->serie,$JSON->cabecera->numero));
		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);

    }

    public function send_ComunicacionBaja($JSON)
    {
    	require './vendor/autoload.php';
    	$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);		
		
		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		$detial1 = new VoidedDetail();
		$detial1->setTipoDoc($JSON->cabecera->tipo_documento)
		    ->setSerie($JSON->cabecera->serie)
		    ->setCorrelativo($JSON->cabecera->numero)
		    ->setDesMotivoBaja('ERROR EN CÁLCULOS');

		$voided = new Voided();
		$voided->setCorrelativo($JSON->anulado->numero)
		    ->setFecGeneracion(new DateTime($JSON->cabecera->fecha_emision))
		    ->setFecComunicacion(new DateTime())
		    ->setCompany($company)
		    ->setDetails([$detial1]); 

		$response = [];
		try{
            ////ENVIAR SUNAT
			$res = $see->send($voided);
			if (!$res->isSuccess()) {			 
				if ($res->getError()->getCode() == '0402') {//COMPROBANTE YA HA SIDO ENVIADO
			   		$response['res'] = 1;
			   		$response['estado'] = 5;
			   		$response['ticket'] = $res->getTicket();
			   		$response['numero'] = $JSON->anulado->numero;
               		$response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
	           		echo json_encode($response);
			   } else {
			   		//print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage());	
				   	print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage());	
				   	$response['res'] = 0;
				  	$response['estado'] = 4;
		        	//$response['msg'] = 'Enviado N° Ticket : '.$res->getTicket();
		        	$response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
		        	$response['ticket'] = $res->getTicket();
		        	$response['numero'] = 'none';
		        	echo json_encode($response);
			   }		   
			   exit();
			}

			$ticket = $res->getTicket();
			$res = $see->getStatus($ticket);
			///$statusResult = $see->getStatus($ticket);
			if (!$res->isSuccess()) {
			    // Si hubo error al conectarse al servicio de SUNAT.
			    $response['res'] = 1;
			   	$response['estado'] = 5;
			    $response['ticket'] = $ticket;
			    $response['numero'] = $JSON->anulado->numero;
			    $response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
			    //var_dump($res->getError());
			    echo json_encode($response);
			    exit();
			}

			//VALIDACION DE CODIGOS DE ERRORES 08-04-2021
			$cdr = $res->getCdrResponse();
			$code = (int)$cdr->getCode();

						

				if ($code === 0) {
				    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
		            $response['res'] = 1;
		            $response['estado'] = 5;
					} else if ($code >= 4000) {
					    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
					    //var_dump($cdr->getNotes());				    
					    $response['res'] = 1;
					    $response['estado'] = 5;
						} else if ($code >= 2000 && $code <= 3999) {
				    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
							if ($code == 2323 || $code == 2324) {//COMPROBANTE YA HA SIDO ENVIADO
							   		$response['res'] = 1;
							   		$response['estado'] = 5;
							   		$response['ticket'] = $ticket;
			    					$response['numero'] = $JSON->anulado->numero;
				               		$response['msg'] = "[code] => ".$code."<br> [message] => ".$res->getCdrResponse()->getDescription();
					           		echo json_encode($response);exit();
			   				}else{
			   					$response['code'] = $code;
					    		$response['res'] = 0;
					    		$response['estado'] = 4;
			   				}}
							else {
							    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
							    /*code: 0100 a 1999 */
							    //echo 'Excepción';
							    $response['code'] = $code;
							    $response['res'] = 0;
							    $response['estado'] = 4;
							}
			
			    $response['msg'] = $res->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
			    $response['ticket'] = $ticket;
			    $response['numero'] = $JSON->anulado->numero;

		        // Guardar XML
				file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$voided->getName().'.xml',$see->getFactory()->getLastXml());
		        // GUARDAR CDR
			    file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$voided->getName().'.zip', $res->getCdrZip());										

		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);

    }

    public function send_resumenBoleta($JSON)
    {
    	require './vendor/autoload.php';
    	$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);		

		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);
		    //CODIGO DE LOCAL			
			if(isset($JSON->empresa->codigolocal) && $JSON->empresa->codigolocal != '')
			    $address->setCodLocal($JSON->empresa->codigolocal);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		foreach($JSON->resumenes as $resumen){
		   $cmpb[] = (new SummaryDetail())
	            ->setTipoDoc($resumen->tipo_documento)
	            ->setSerieNro($resumen->serie."-".$resumen->numero)
	            ->setEstado(3)
	            ->setClienteTipo($resumen->tipo_documento_cliente)
	            ->setClienteNro($resumen->ruc_cliente)
	            ->setTotal($resumen->importe_venta)
	            ->setMtoOperGravadas($resumen->gravadas)
	            //->setMtoOperInafectas($cmp['total_inafecta'])
	            //->setMtoOperExoneradas($cmp['total_exonerada'])
	            //->setMtoOperExportacion(10)
	            //->setMtoOtrosCargos($cmp['total_otros_cargos'])
	            ->setMtoIGV($resumen->impuestos);  
	    }	

	    $sum = new Summary();
		$sum->setFecGeneracion(new \DateTime('-3days'))
		    ->setFecResumen(new \DateTime('-1days'))
		    ->setCorrelativo($JSON->correlativo_resumen)
		    ->setCompany($company)
		    ->setDetails($cmpb);


			$response = [];
			$JSON->anulado->numero = 1;//NÚMERO PARA BOLETAS 11-06-2021/ALEXANDER FERNÁNDEZ
		try{
          ////ENVIAR SUNAT
			$res = $see->send($sum);
			if (!$res->isSuccess()) {
				if ($res->getError()->getCode() == '0402') {//COMPROBANTE YA HA SIDO ENVIADO
			   		$response['res'] = 1;
			   		$response['estado'] = 5;
			   		$response['ticket'] = $res->getTicket();
			   		$response['numero'] = $JSON->anulado->numero;
               		$response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();	 

	               	// Guardar XML
					file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$sum->getName().'.xml',$see->getFactory()->getLastXml());
			        // GUARDAR CDR
				   // file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$sum->getName().'.zip', $res->getCdrZip());          		
	           		echo json_encode($response);
			   } else {
			   		//print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage());	
				   	print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage());	
				   	$response['res'] = 0;
				  	$response['estado'] = 4;
		        	$response['msg'] = 'Enviado N° Ticket : '.$res->getTicket();
		        	$response['ticket'] = $res->getTicket();
		        	$response['numero'] = 'none';
			   }		   
			   exit();
			}

			$ticket = $res->getTicket();
			$res = $see->getStatus($ticket);

			if (!$res->isSuccess()) {
			    // Si hubo error al conectarse al servicio de SUNAT.
			    $response['res'] = 1;
			   	$response['estado'] = 5;
			    $response['ticket'] = $ticket;
			    $response['numero'] = $JSON->anulado->numero;
			    $response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
			    //var_dump($res->getError());
			    echo json_encode($response);
			    exit();
			}

			//VALIDACION DE CODIGOS DE ERRORES 08-04-2021
			$cdr = $res->getCdrResponse();
			$code = intval($cdr->getCode());		
            //var_dump($code);exit;
				if ($code === 0) {
				    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
		            $response['res'] = 1;
		            $response['estado'] = 5;
					}else if($code === 2223) // SMITH FERNANDEZ 26/04/2022
					{         // ESTO PARA CUANDO EL RESUMEN FUE PRESENTADO ANTERIORMENTE
				      $response['res'] = 1;
		              $response['estado'] = 5;
					} else if ($code >= 4000) {
					    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
					    //var_dump($cdr->getNotes());				    
					    $response['res'] = 1;
					    $response['estado'] = 5;
						} else if ($code >= 2000 && $code <= 3999) {
				    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
				    		$response['res'] = 0;
				    		$response['estado'] = 4;
							} else {
							    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
							    /*code: 0100 a 1999 */
							    //echo 'Excepción';
							    $response['res'] = 0;
							    $response['estado'] = 4;
							}

                $response['code'] = $code;
		        $response['msg'] = $res->getCdrResponse()->getCode()." ".$res->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
			    $response['ticket'] = $ticket;
			    $response['numero'] = $JSON->anulado->numero;
			    

		        // Guardar XML
				file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$sum->getName().'.xml',$see->getFactory()->getLastXml());
		        // GUARDAR CDR
			    file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$sum->getName().'.zip', $res->getCdrZip());						
		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);
    }


    //RESUMEN DIARIO BOLETAS 20-10-2020
    public function send_resumenDiarioBoleta($JSON)
    {
    	require './vendor/autoload.php';
    	$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;

		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$envio_pse);		

		$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);

		$company = new Company();
		$company->setRuc($JSON->empresa->ruc)
		    ->setRazonSocial($JSON->empresa->razon_social)
		    ->setNombreComercial($JSON->empresa->nombre_comercial)
		    ->setAddress($address);

		//RESUMEN ESTADO
			$resumenEstado = 1;		
        $cmpb = [];
		foreach($JSON->resumenes as $resumen){
		   $cmp = (new SummaryDetail())
	            ->setTipoDoc($resumen->tipo_documento)
	            ->setSerieNro($resumen->serie."-".$resumen->numero)
	            ->setEstado($resumenEstado)
	            ->setClienteTipo($resumen->tipo_documento_cliente)
	            ->setClienteNro($resumen->ruc_cliente)
	            ->setTotal($resumen->importe_venta);
	            //->setMtoOperGravadas($resumen->gravadas)
	            //->setMtoOperExoneradas(100)
	            //->setMtoOperInafectas($cmp['total_inafecta'])
	            //->setMtoOperExoneradas($cmp['total_exonerada'])
	            //->setMtoOperExportacion(10)
	            //->setMtoOtrosCargos($cmp['total_otros_cargos'])
	            //->setMtoIGV($resumen->impuestos);  
	            
                //IMPUESTOS 16-04-2020
                if(isset($resumen->impuestos) && $resumen->impuestos > 0){
                    $cmp->setMtoIGV($resumen->impuestos);
                }
	            //OPERACIONES GRAVADAS 15-04-2020
				if(isset($resumen->gravadas) && $resumen->gravadas > 0){
					$cmp->setMtoOperGravadas($resumen->gravadas);
				}
	            //OPERACIONES EXONERADAS 12-04-2020
	            if(isset($resumen->exoneradas) && $resumen->exoneradas > 0){
	            	$cmp->setMtoOperExoneradas($resumen->exoneradas);
	            }	           
	            $cmpb[] = $cmp;
	            //$cmpb[] = (array) $cmp;	        
	    }		               
	    $sum = new Summary();
		$sum->setFecGeneracion(new \DateTime('-3days'))
		    ->setFecResumen(new \DateTime('-1days'))
		    ->setCorrelativo($JSON->correlativo_resumen)
		    ->setCompany($company)
		    ->setDetails($cmpb);

			$response = [];
		try{

			////ENVIAR SUNAT
			$res = $see->send($sum);
			if (!$res->isSuccess()) {
				if ($res->getError()->getCode() == '0402') {//COMPROBANTE YA HA SIDO ENVIADO
			   		$response['res'] = 1;
			   		$response['estado'] = 3;
			   		$response['ticket'] = $res->getTicket();
			   		$response['numero'] = 666;
			   		//$response['numero'] = $JSON->anulado->numero;
               		$response['msg'] = "[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();

               		// Guardar XML
					//file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$sum->getName().'.xml',$see->getFactory()->getLastXml());
			        // GUARDAR CDR
				    file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$sum->getName().'.zip', $res->getCdrZip());           		
	           		echo json_encode($response);
			   } else {
			   		//print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$result->getError()->getCode()."<br> [message] => ".$result->getError()->getMessage());	
				   	print_r("[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage());	
				   	$response['res'] = 0;
				  	$response['estado'] = 4;
		        	$response['msg'] = 'Enviado N° Ticket : '.$res->getTicket();
		        	$response['ticket'] = $res->getTicket();
		        	$response['numero'] = 'none';
					/*$response['res'] = 1;
		            $response['estado'] = 3;
					$response['ticket'] = $res->getTicket();*/
					echo json_encode($response);
			   }		   
			   exit();
			}

			$ticket = $res->getTicket();
			$res = $see->getStatus($ticket);
			//echo $ticket;
			//var_dump($res->error);


			//VALIDACION DE CODIGOS DE ERRORES 08-04-2021
			$cdr = $res->getCdrResponse();
			$code = (int)$cdr->getCode();			

			//echo $code;exit;

				if ($code === 0) {
				    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
		            $response['res'] = 1;
		            $response['estado'] = 3;
					} else if ($code >= 4000) {
					    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
					    //var_dump($cdr->getNotes());				    
					    $response['res'] = 1;
					    $response['estado'] = 3;
						} else if ($code >= 2000 && $code <= 3999) {
				    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
				    		$response['res'] = 0;
				    		$response['estado'] = 4;
							if($code == 2223){
								$response['res'] = 1;
		            			$response['estado'] = 3;						
							}} else {
							    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
							    /*code: 0100 a 1999 */
							    //echo 'Excepción';
							    $response['res'] = 0;
							    $response['estado'] = 4;
							}

				//$response['code'] = $code;
				$response['msg'] = $res->getCdrResponse()->getCode()." ".$res->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
			    $response['ticket'] = $ticket;
			    //$response['numero'] = $JSON->anulado->numero;

		        // Guardar XML
				file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$sum->getName().'.xml',$see->getFactory()->getLastXml());
		        // GUARDAR CDR
			    file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$sum->getName().'.zip', $res->getCdrZip());

		}catch(Exception $e){
	      	$response['res'] = 0; 
	    }	        
      
	    echo json_encode($response);
    }
    
    //RESUMEN DIARIO BOLETAS 04-02-2026
    public function send_resumenDiarioBoletaStatusTicket($JSON)
    {
    	require './vendor/autoload.php';
    	$envio_pse = '';
		if(isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '')
			    $envio_pse = $JSON->empresa->envio_pse;
			    
			    //echo 1;exit;
			    
	    $options = [
            'location' => 'https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService',
            'uri' => 'http://service.sunat.gob.pe',
            'login' => '10455923951HOULATEN',
            'password' => 'erynchuxu',
            'trace' => true
        ];

        //$client = new SoapClient(null, $options);

		//$wsdl = "https://e-factura.sunat.gob.pe/ol-it-wsconscpegem/billConsultService?wsdl";
        /*$options = [
            'login'    => '20613625047MARSEM',
            'password' => 'mNIGUhHH',
            'trace'    => true,
            'cache_wsdl' => WSDL_CACHE_NONE
        ];*/
        
        try {
            //$client = new SoapClient($wsdl, $options);
            $client = new SoapClient(null, $options);
        
            $params = [
                'ticket' => '202619737240919'
            ];
        
            $response = $client->__soapCall('getStatus', [$params]);
        
            print_r($response);
        
        } catch (SoapFault $e) {
            echo "Error SOAP: " . $e->getMessage();
        }

			//$ticket = $res->getTicket();
			//$ticket = "202619737240919";
			//$res = $see->getStatus($ticket);


			//VALIDACION DE CODIGOS DE ERRORES 08-04-2021
			/*$cdr = $res->getCdrResponse();
			$code = (int)$cdr->getCode();			

				if ($code === 0) {
				    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
		            $response['res'] = 1;
		            $response['estado'] = 3;
					} else if ($code >= 4000) {
					    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
					    //var_dump($cdr->getNotes());				    
					    $response['res'] = 1;
					    $response['estado'] = 3;
						} else if ($code >= 2000 && $code <= 3999) {
				    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
				    		$response['res'] = 0;
				    		$response['estado'] = 4;
							} else {
							    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
							    /*code: 0100 a 1999 */
							    //echo 'Excepción';*/
							    //$response['res'] = 0;
							    //$response['estado'] = 4;
							//}

		        //$response['msg'] = $res->getCdrResponse()->getDescription().$this->session->userdata('mensaje');
			    //$response['ticket'] = $ticket;

		        // Guardar XML
				//file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$sum->getName().'.xml',$see->getFactory()->getLastXml());
		        // GUARDAR CDR
			    //file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$sum->getName().'.zip', $res->getCdrZip());
	    //echo json_encode($response);
    }
    
    public function dowload_xml($rucEmpresa,$tipodocCodigo,$comprobanteSerie,$comprobanteSNumero) {
        
        $archivoXML = "{$rucEmpresa}-{$tipodocCodigo}-{$comprobanteSerie}-{$comprobanteSNumero}.xml";
        $rutaFirma = "sfs/".$rucEmpresa."/XML/{$archivoXML}";
        if (file_exists($rutaFirma)) {
            header('Content-Description: File Transfer');
            header('Content-Type: application/xml');
            header('Content-Disposition: attachment; filename="'.basename($rutaFirma).'"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . filesize($rutaFirma));
            flush(); // Flush system output buffer
            readfile($rutaFirma);
            exit;
        
        } else {
            echo "El fichero $nombre_fichero no existe";
        }
    }


	public function get_xml($rucEmpresa,$tipodocCodigo,$comprobanteSerie,$comprobanteSNumero){
	    		    	
	    	$archivoXML = "{$rucEmpresa}-{$tipodocCodigo}-{$comprobanteSerie}-{$comprobanteSNumero}.xml";
	        $rutaFirma = "sfs/".$rucEmpresa."/XML/{$archivoXML}";

	        $sección = readfile($rutaFirma);				       
	         if (file_exists($rutaFirma)) {
	         	//ECHO '12';EXIT;
	         	return $rutaFirma;            

	        } else {
	        	//ECHO '10';EXIT;
	            return false;
	        }
	    }
    
    public function dowload_cdr($rucEmpresa,$tipodocCodigo,$comprobanteSerie,$comprobanteSNumero) {
        
        $archivoZIP = "R-{$rucEmpresa}-{$tipodocCodigo}-{$comprobanteSerie}-{$comprobanteSNumero}.zip";
        $rutaFirma = "sfs/".$rucEmpresa."/CDR/{$archivoZIP}";
        if (file_exists($rutaFirma)) {
            header('Content-Description: File Transfer');
            header('Content-Type: application/xml');
            header('Content-Disposition: attachment; filename="'.basename($rutaFirma).'"');
            header('Expires: 0');
            header('Cache-Control: must-revalidate');
            header('Pragma: public');
            header('Content-Length: ' . filesize($rutaFirma));
            flush(); // Flush system output buffer
            readfile($rutaFirma);
            exit;
        
        } else {
            echo "El fichero $nombre_fichero no existe";
        }
    }

   
    public function getFirmaDigital($rucEmpresa,$tipodocCodigo,$comprobanteSerie,$comprobanteSNumero)
    {
        $archivoXML = "{$rucEmpresa}-{$tipodocCodigo}-{$comprobanteSerie}-{$comprobanteSNumero}.xml";
        $rutaFirma = "sfs/".$rucEmpresa."/XML/{$archivoXML}";
        $certificado = '';
        //calidamos que exista fichero 
        if(file_exists($rutaFirma))
        {
            $library = new SimpleXMLElement($rutaFirma, null, true);
            $ns = $library->getDocNamespaces();
            $ext1 = $library->children($ns['ext']);
            $ext2 = $ext1->children($ns['ext']);
            $ext3 = $ext2->children($ns['ext']);
            $ds1 = $ext3->children($ns['ds']);
            $ds2 = $ds1->children($ns['ds']);
            $certificado = $ds2->SignedInfo->Reference->DigestValue; 

        }

        return $certificado;
    }


     public function send_guiaRemision()
	{
	   $JSON = json_decode($_POST['datosJSON']);

	   //Acceso Guia 20/06/2024
	   $JSON->empresa->acceso_guia = 1;
	   $this->validaAccesoCustomer($JSON);
       $this->send_xmlGuiaRemisionGRE($JSON);
	}

	 public function send_statusTicketGRE()
	{
	   $JSON = json_decode($_POST['datosJSON']);

	   //Acceso Guia 20/06/2024
	   $JSON->empresa->acceso_guia = 1;
	   $this->validaAccesoCustomer($JSON);
       $this->send_statusTicketGuiaRemisionGRE($JSON);
	}

    //GUÍA DE REMISIÓN
    public function send_xmlGuiaRemision($JSON){
				// (Validación eliminada, se deja como estaba antes)
    	require './vendor/autoload.php';    	
		$see = $this->config($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,1);

			//$util = Util::getInstance();
			//$rel = new Document();
			//$rel->setTipoDoc('02') // Tipo: Numero de Orden de Entrega
			//	->setNroDoc('213123');


			$company = new Company();
			$company->setRuc($JSON->empresa->ruc)
				    ->setRazonSocial($JSON->empresa->razon_social)
				    ->setNombreComercial($JSON->empresa->nombre_comercial)
				    ->setAddress($address);				

			$transp = new Transportist();
			$transp->setTipoDoc($JSON->cabecera->transporte_codigo)
				   ->setNumDoc($JSON->cabecera->transporte_ruc)
				   ->setRznSocial($JSON->cabecera->transporte_razon_social)
				   ->setPlaca($JSON->cabecera->vehiculo_placa)
				   ->setChoferTipoDoc($JSON->cabecera->conductor_codigo)
				   ->setChoferDoc($JSON->cabecera->conductor_ruc);

			$envio = new Shipment();
			$envio->setCodTraslado($JSON->cabecera->motivo_codigo) // Cat.20
				  ->setDesTraslado($JSON->cabecera->motivo_descripcion)
				  ->setModTraslado($JSON->cabecera->modalidad_codigo) // Cat.18
				  ->setFecTraslado(new DateTime())
				  //->setCodPuerto('123')
				  ->setIndTransbordo(false)
				  ->setPesoTotal($JSON->cabecera->peso_total)
				  ->setUndPesoTotal('KGM')
				//    ->setNumBultos(2) // Solo válido para importaciones
				//    ->setNumContenedor('XD-2232')
				  ->setPartida(new Direction($JSON->cabecera->ubigeo_partida, $JSON->cabecera->partida_direccion))
				  ->setLlegada(new Direction($JSON->cabecera->ubigeo_llegada, $JSON->cabecera->llegada_direccion))
				  ->setTransportista($transp);

			$despatch = new Despatch();
			$despatch->setTipoDoc($JSON->cabecera->tipo_documento)
				     ->setSerie($JSON->cabecera->guia_serie)
				     ->setCorrelativo($JSON->cabecera->guia_numero)
				     ->setFechaEmision(new DateTime())
				     ->setCompany($company)
				     ->setDestinatario((new Client())
			         ->setTipoDoc($JSON->cabecera->destinatario_codigo)
			         ->setNumDoc($JSON->cabecera->destinatario_ruc)
			         ->setRznSocial($JSON->cabecera->destinatario_razon_social))
			    	 //->setTercero((new Client())
			         //->setTipoDoc('6')
			         //->setNumDoc('20000000003')
			         //->setRznSocial('EMPRESA SA'))
				     ->setObservacion('NOTA GUIA')
				     //->setRelDoc($rel)
				     ->setEnvio($envio);

			

			foreach ($JSON->detalle as $detalle) {
				$item_i = new DespatchDetail();
				$item_i->setCantidad($detalle->cantidad)
					   ->setUnidad($detalle->unidad)
					   ->setDescripcion($detalle->descripcion)
					   ->setCodigo($detalle->codigo)
					   ->setCodProdSunat($detalle->sunat);
				$item[] =  $item_i;
			}

			$despatch->setDetails($item);
			// Envio a SUNAT.
			//$see = $util->getSee(SunatEndpoints::GUIA_BETA);

		$response = [];
		try{

			$res = $see->send($despatch);
			if (!$res->isSuccess()) {			   			   
			   if ($res->getError()->getCode() == 1033) {//COMPROBANTE YA HA SIDO ENVIADO
			   		$response['res'] = 1; 
               		$response['msg'] = "COMPROBANTE YA SE ENCUENTRA REGISTRADO <br>[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
	           		$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->guia_serie,$JSON->cabecera->guia_numero));	
	           		echo json_encode($response);
			   } else {
			   		print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage());	
			   }			   
			   exit(); 
			}
			
				//VALIDACION DE CODIGOS DE ERRORES
				$cdr = $res->getCdrResponse();
				$code = (int)$cdr->getCode();
				$response['res'] = 1;

				if ($code === 0) {
				    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
		            $response['res'] = 1;
					} else if ($code >= 4000) {
					    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
					    //var_dump($cdr->getNotes());				    
					    $response['res'] = 1;
						} else if ($code >= 2000 && $code <= 3999) {
				    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
				    		$response['res'] = 0;			    		
							} else {
							    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
							    /*code: 0100 a 1999 */
							    //echo 'Excepción';
							    $response['res'] = 0;
							}

				// Guardar XML
				file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$despatch->getName().'.xml',$see->getFactory()->getLastXml());
			    // GUARDAR CDR
				file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$despatch->getName().'.zip', $res->getCdrZip());
				$response['msg'] = $res->getCdrResponse()->getDescription();
				$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->guia_serie,$JSON->cabecera->guia_numero));
			    //$util->showResponse($despatch, $cdr);
			} catch(Exception $e){
	      		$response['res'] = 0; 
	    	}			
			echo json_encode($response);    
	}

//GUÍA DE REMISIÓN GRE REST 12-01-2023// ALEXANDER FERNÁNDEZ
public function send_xmlGuiaRemisionGRE($JSON){
		$item = [];
	// Validación SOLO para guía GRE
	$pesoTotal = isset($JSON->cabecera->peso_total) ? $JSON->cabecera->peso_total : 0;
	if (!is_numeric($pesoTotal) || $pesoTotal <= 0 || round($pesoTotal, 3) != $pesoTotal) {
		$response = [
			'res' => 0,
			'msg' => 'El Peso Bruto Total debe ser numérico, mayor a cero y con máximo 3 decimales. Valor recibido: ' . $pesoTotal
		];
		echo json_encode($response);
		return;
	}

	require './vendor/autoload.php';

	$client_id = '70bae3cc-53cc-49c5-a69e-d2d6d1090e93';
	//$client_secret = 'eKiZA6rxoNuJnIjABPjx7Q%3D%3D';
	$client_secret = 'd3zcun+948VLlHWCm9djig==';

	//$empresa = '10455923951';
	//$user = 'HOULATEN';
	//$pass = 'erynchuxu';
	if(isset($JSON->empresa->client_id) && ($JSON->empresa->client_id != '')){
		$client_id = $JSON->empresa->client_id;
	}
	if(isset($JSON->empresa->client_secret) && ($JSON->empresa->client_secret != '')){
		$client_secret = $JSON->empresa->client_secret;
	}

	$api = $this->configGRE($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$client_id,$client_secret);
	//$api = $this->configGRE('10455923951','MODDATOS','MODDATOS',$client_id,$client_secret);

	/*$address = new Address();
		$address->setUbigueo($JSON->empresa->ubigeo)
		    ->setDepartamento($JSON->empresa->departamento)
		    ->setProvincia($JSON->empresa->provincia)
		    ->setDistrito($JSON->empresa->distrito)
		    ->setUrbanizacion($JSON->empresa->urbanizacion)
		    ->setDireccion($JSON->empresa->direccion);*/
	
	$company = new Company();
			$company->setRuc($JSON->empresa->ruc)
				    ->setRazonSocial($JSON->empresa->razon_social);
				    //->setNombreComercial($JSON->empresa->nombre_comercial)
				    //->setAddress($address);	
				    
	$fechaTraslado = isset($JSON->cabecera->fecha_traslado) && trim($JSON->cabecera->fecha_traslado) !== '' ? $JSON->cabecera->fecha_traslado : (new DateTime());
	
	//VALIDACIÓN DE TRANSPORTE PRIVADO/PUBLICO
   	if(isset($JSON->cabecera->modalidad_codigo) && $JSON->cabecera->modalidad_codigo == "02") {	
			$licenciaConductor = isset($JSON->cabecera->conductor_licencia)
				? trim((string)$JSON->cabecera->conductor_licencia)
				: '';

			if ($licenciaConductor === '') {
				echo json_encode([
					'res' => 0,
					'msg' => 'Falta la licencia del conductor para transporte privado. SUNAT requiere este dato para el conductor principal.'
				]);
				return;
			}   		
   		$vehiculoPrincipal = (new Vehicle())
								    ->setPlaca($JSON->cabecera->vehiculo_placa);
								    //->setSecundarios([$vehiculoSecundario]); // opcional

					$chofer = (new Driver())
						->setTipo('Principal')
						->setTipoDoc($JSON->cabecera->conductor_codigo)
						->setNroDoc($JSON->cabecera->conductor_ruc)
						->setLicencia($JSON->cabecera->conductor_licencia)
						->setNombres($JSON->cabecera->conductor_razon_social)
						->setApellidos($JSON->cabecera->conductor_razon_social);
												    												    												   			
				   	$envio = new Shipment();
					$envio
					    ->setCodTraslado($JSON->cabecera->motivo_codigo) // Cat.20 - Venta
					    ->setModTraslado($JSON->cabecera->modalidad_codigo) // Cat.18 - Transp. Privado
					    
					    ->setPesoTotal($JSON->cabecera->peso_total)
				        ->setUndPesoTotal('KGM')
				    ->setFecTraslado($fechaTraslado)
					    ->setPartida(new Direction($JSON->cabecera->ubigeo_partida, $JSON->cabecera->partida_direccion))
					    ->setLlegada(new Direction($JSON->cabecera->ubigeo_llegada, $JSON->cabecera->llegada_direccion))
					    ->setVehiculo($vehiculoPrincipal)
                        ->setChoferes([$chofer]);

   	} else {
			//$transp->setTipoDoc($JSON->cabecera->transporte_codigo)
   			$transp = new Transportist();
			$transp->setTipoDoc(isset($JSON->cabecera->transporte_codigo) && $JSON->cabecera->transporte_codigo != '' ? $JSON->cabecera->transporte_codigo : '6')
				   ->setNumDoc($JSON->cabecera->transporte_ruc)
				   ->setRznSocial($JSON->cabecera->transporte_razon_social);
			// NroMtc: número de autorización MTC del transportista (requerido por SUNAT)
			if(isset($JSON->cabecera->nro_mtc) && $JSON->cabecera->nro_mtc != '') {
				$transp->setNroMtc($JSON->cabecera->nro_mtc);
			}

			$envio = new Shipment();
			$envio->setCodTraslado($JSON->cabecera->motivo_codigo) // Cat.20
				->setDesTraslado($JSON->cabecera->motivo_descripcion)
				->setModTraslado($JSON->cabecera->modalidad_codigo) // Cat.18
				->setFecTraslado($fechaTraslado)
				//->setCodPuerto('123')
				//->setIndTransbordo(false)
				->setPesoTotal($JSON->cabecera->peso_total)
				->setUndPesoTotal('KGM')
				//    ->setNumBultos(2) // Solo válido para importaciones
				//    ->setNumContenedor('XD-2232')
				  ->setPartida(new Direction($JSON->cabecera->ubigeo_partida, $JSON->cabecera->partida_direccion))
				  ->setLlegada(new Direction($JSON->cabecera->ubigeo_llegada, $JSON->cabecera->llegada_direccion))
				  ->setTransportista($transp);		   
   	}

	$despatch = new Despatch();
			$despatch
					 ->setVersion('2022')
					 ->setTipoDoc($JSON->cabecera->tipo_documento)
				     ->setSerie($JSON->cabecera->guia_serie)
				     ->setCorrelativo($JSON->cabecera->guia_numero)
				     ->setFechaEmision(new DateTime())
				     ->setCompany($company)
				     ->setDestinatario((new Client())
				         ->setTipoDoc($JSON->cabecera->destinatario_codigo)
				         ->setNumDoc($JSON->cabecera->destinatario_ruc)
				         ->setRznSocial($JSON->cabecera->destinatario_razon_social))
			    	 //->setTercero((new Client())
			         //->setTipoDoc('6')
			         //->setNumDoc('20000000003')
			         //->setRznSocial('EMPRESA SA'))
				     //->setObservacion('NOTA GUIA')
				     //->setRelDoc($rel)
				     ->setEnvio($envio);

			

			foreach ($JSON->detalle as $detalle) {
				$item_i = new DespatchDetail();
				$item_i->setCantidad($detalle->cantidad)
					   ->setUnidad($detalle->unidad)
					   ->setDescripcion($detalle->descripcion)
					   ->setCodigo($detalle->codigo);
					   //->setCodProdSunat($detalle->sunat);
				$item[] =  $item_i;
			}

			$despatch->setDetails($item);
	
	

	// Envio a SUNAT.
	//$api = $util->getSeeApi();
	$response = [];

	try{

	$res = $api->send($despatch);
	/*$util->writeXml($despatch, $api->getLastXml());*/
		if (!$res->isSuccess()) {
		    //echo $util->getErrorResponse($res->getError());
		    var_dump($res->getError());exit();
		    return;
		}

	/**@var $res SummaryResult*/
	$ticket = $res->getTicket();
	//echo 'Ticket :<strong>' . $ticket .'</strong>';

	$res = $api->getStatus($ticket);
	if (!$res->isSuccess()) {
	    //echo $util->getErrorResponse($res->getError());
	    //return;		
		//var_dump($res->getError());exit();
	    if ($res->getError()->getCode() == 1033) {//COMPROBANTE YA HA SIDO ENVIADO
				   		$response['res'] = 1; 
				   		$response['ticket'] = $ticket;
	               		$response['msg'] = "COMPROBANTE YA SE ENCUENTRA REGISTRADO <br>[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
		           		//$response['firma'] = json_encode($this->getFirmaDigital($JSONEmpresa,$JSONTipo_documento,$JSONGuia_serie,$JSONGuia_numero));	
		           		$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->guia_serie,$JSON->cabecera->guia_numero));	
		           		echo json_encode($response);
				   }else if($res->getError()->getCode() == 98){
				   		$response['res'] = 1; 
				   		$response['ticket'] = $ticket;
	               		$response['msg'] = "COMPROBANTE REGISTRADO <br>[code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage();
		           		//$response['firma'] = json_encode($this->getFirmaDigital($JSONEmpresa,$JSONTipo_documento,$JSONGuia_serie,$JSONGuia_numero));	
		           		$response['firma'] = json_encode($this->getFirmaDigital($JSON->empresa->ruc,$JSON->cabecera->tipo_documento,$JSON->cabecera->guia_serie,$JSON->cabecera->guia_numero));	
		           		echo json_encode($response);
				   }
				    else {
				   		print_r("SERVIDOR SUNAT NO RESPONDE <br> [code] => ".$res->getError()->getCode()."<br> [message] => ".$res->getError()->getMessage()
				   			."<br> [ticket] => ".$ticket);	
				   }			   
		exit();
	}

	$cdr = $res->getCdrResponse();
	//$util->writeCdr($despatch, $res->getCdrZip());
	$code = (int)$cdr->getCode();

	//echo $code;exit;
					$response['res'] = 1;
					$response['ticket'] = $ticket;

					if ($code === 0) {
					    //echo 'ESTADO: ACEPTADA'.PHP_EOL;
			            $response['res'] = 1;
						} else if ($code >= 4000) {
						    //echo 'ESTADO: ACEPTADA CON OBSERVACIONES:'.PHP_EOL;
						    //var_dump($cdr->getNotes());				    
						    $response['res'] = 1;
							} else if ($code >= 2000 && $code <= 3999) {
					    		//echo 'ESTADO: RECHAZADA'.PHP_EOL;
					    		$response['res'] = 0;			    		
								} else {
								    /* Esto no debería darse, pero si ocurre, es un CDR inválido que debería tratarse como un error-excepción. */
								    /*code: 0100 a 1999 */
								    //echo 'Excepción';
								    $response['res'] = 0;
								}

					// Guardar XML
					file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$despatch->getName().'.xml',$api->getLastXml());
				    // GUARDAR CDR
					file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$despatch->getName().'.zip', $res->getCdrZip());
					$response['msg'] = $res->getCdrResponse()->getDescription();

					//$util->showResponse($despatch, $cdr);

		} catch(Exception $e){
			echo $e;exit;
		    $response['res'] = 0;		    
		}			
				echo json_encode($response);
}

//STATUSTICKETGRE REST 23-06-2024// ALEXANDER FERNÁNDEZ
public function send_statusTicketGuiaRemisionGRE($JSON){

	require './vendor/autoload.php';

	$client_id = '70bae3cc-53cc-49c5-a69e-d2d6d1090e93';
	$client_secret = 'd3zcun+948VLlHWCm9djig==';
	$ticket = '84a59ae2-1bb4-4d8b-ba95-e38a1189f879';
	
	if(isset($JSON->empresa->client_id) && ($JSON->empresa->client_id != '')){
		$client_id = $JSON->empresa->client_id;
	}
	if(isset($JSON->empresa->client_secret) && ($JSON->empresa->client_secret != '')){
		$client_secret = $JSON->empresa->client_secret;
	}
	if(isset($JSON->cabecera->ticket) && ($JSON->cabecera->ticket != '')){
		$ticket = $JSON->cabecera->ticket;
	}

	$api = $this->configGRE($JSON->empresa->ruc,$JSON->empresa->user,$JSON->empresa->pass,$client_id,$client_secret);	


	/*$despatch = new Despatch();
			$despatch
					 ->setVersion('2022')
					 ->setTipoDoc($JSON->cabecera->tipo_documento)
				     ->setSerie($JSON->cabecera->guia_serie)
				     ->setCorrelativo($JSON->cabecera->guia_numero)
				     ->setFechaEmision(new DateTime())
				     ->setCompany($company)
				     ->setDestinatario((new Client())
				         ->setTipoDoc($JSON->cabecera->destinatario_codigo)
				         ->setNumDoc($JSON->cabecera->destinatario_ruc)
				         ->setRznSocial($JSON->cabecera->destinatario_razon_social))			    	 
				     	 ->setEnvio($envio);*/
		

	$response = [];	
	try
	{			
	//$ticket = 'a23d601f-b667-41db-8687-ae918c19727e';	
	//$ticket = '99e29eda-10d1-46a3-9156-875a7e9dd03d';
	//$ticket = '84a59ae2-1bb4-4d8b-ba95-e38a1189f879';	
	$res = $api->getStatus($ticket);
	//var_dump($res->isSuccess());exit;
		if ($res->isSuccess()) {
			//$res->setCdrZip(base64_encode($res->getCdrZip()));
			//echo $res->isSuccess();exit;
			if ($res->getCdrResponse()->getCode() == 0) {
				//$response['msg'] = $result->getCdrResponse()->getDescription().$this->session->userdata('mensaje');			
				//$response['msg'] = $result->getCdrResponse()->getDescription();	
				$response['res'] = 1;
				$response['code'] = $res->getCdrResponse()->getCode();						
				$response['link'] = $res->getCdrResponse()->getReference();				
				//$response['errorMessage'] = $res->getError()->getMessage();				
			} else {
				$response['res'] = 1;
				$response['code'] = $res->getCdrResponse()->getCode();									
				$response['link'] = $res->getCdrResponse()->getReference();
				$response['errorCode'] = $res->getCdrResponse()->getCode();
				$response['errorMessage'] = $res->getError()->getMessage();
			}			
		}else {
			$response['res'] = 1;
			$response['code'] = $res->getError()->getCode();
			$response['errorMessage'] = $res->getError()->getMessage();
		}
		//var_dump($response);exit;
	// Guardar XML
	//file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.$despatch->getName().'.xml',$api->getLastXml());
	//file_put_contents('sfs/'.$JSON->empresa->ruc.'/XML/'.'demo'.'.xml',$api->getLastXml());
	// GUARDAR CDR
	//file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-'.$despatch->getName().'.zip', $res->getCdrZip());
	//file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/'.'R-demo'.'.zip', $res->getCdrZip());
	//$response['msg'] = $res->getCdrResponse()->getDescription();					

	} catch(Exception $e){
			echo $e;exit;
		    $response['res'] = 0;		    
	}				
	//echo json_encode($response);
	echo json_encode($response);
}

// NUEVO METODO UNIFICADO: CONSULTA DE TICKET PARA TODOS LOS ESCENARIOS ASINCRONOS
// Base: flujo de ResumenTicket con getStatus($ticket), sin depender de parser GRE.
public function send_statusTicketAsyncUniversal(){
	$JSON = json_decode($_POST['datosJSON']);
	$this->validaAccesoCustomer($JSON);
	$this->statusTicketSunatUniversal($JSON);
}

private function statusTicketSunatUniversal($JSON)
{
	require './vendor/autoload.php';

	$response = [
		'res' => 0,
		'estado' => 2,
		'code' => null,
		'ticket' => null,
		'codRespuesta' => null,
		'desRespuesta' => null,
		'errorCode' => null,
		'errorMessage' => null,
		'link' => null,
	];

	try {
		$ticket = isset($JSON->cabecera->ticket) ? trim((string) $JSON->cabecera->ticket) : '';
		if ($ticket === '') {
			$response['errorCode'] = 'MISSING_TICKET';
			$response['errorMessage'] = 'Ticket requerido para consulta SUNAT';
			echo json_encode($response);
			return;
		}

		$envio_pse = '';
		if (isset($JSON->empresa->envio_pse) && $JSON->empresa->envio_pse != '') {
			$envio_pse = $JSON->empresa->envio_pse;
		}

		$see = $this->config($JSON->empresa->ruc, $JSON->empresa->user, $JSON->empresa->pass, $envio_pse);
		$res = $see->getStatus($ticket);

		$response['ticket'] = $ticket;

		if (!$res->isSuccess()) {
			$response['res'] = 0;
			$response['estado'] = 2;
			$response['code'] = '99';
			$response['errorCode'] = method_exists($res->getError(), 'getCode') ? (string) $res->getError()->getCode() : 'SUNAT_COMM_ERROR';
			$response['errorMessage'] = $res->getError()->getMessage();
			echo json_encode($response);
			return;
		}

		$statusCode = (string) $res->getCode();
		$response['code'] = $statusCode;

		if ($statusCode === '0') {
			$cdr = $res->getCdrResponse();
			$cdrCode = $cdr ? (string) $cdr->getCode() : '0';
			$cdrDesc = $cdr ? (string) $cdr->getDescription() : 'Ticket procesado correctamente';
			$cdrLink = $cdr && method_exists($cdr, 'getReference') ? (string) $cdr->getReference() : null;

			$response['res'] = 1;
			$response['estado'] = 3;
			$response['codRespuesta'] = $cdrCode;
			$response['desRespuesta'] = $cdrDesc;
			$response['link'] = $cdrLink !== '' ? $cdrLink : null;

			if (method_exists($res, 'getCdrZip')) {
				$cdrZip = $res->getCdrZip();
				if (!empty($cdrZip)) {
					@file_put_contents('sfs/'.$JSON->empresa->ruc.'/CDR/R-'.$ticket.'.zip', $cdrZip);
				}
			}
		} elseif ($statusCode === '98') {
			$response['res'] = 1;
			$response['estado'] = 2;
			$response['desRespuesta'] = 'Ticket en proceso, consultar nuevamente';
		} elseif ($statusCode === '99') {
			$response['res'] = 0;
			$response['estado'] = 4;
			$response['errorCode'] = '99';
			$response['errorMessage'] = 'Ticket con observacion o error en SUNAT';
		} else {
			$response['res'] = 1;
			$response['estado'] = 2;
			$response['desRespuesta'] = 'Ticket en estado intermedio: '.$statusCode;
		}
	} catch (Exception $e) {
		$response['res'] = 0;
		$response['estado'] = 4;
		$response['errorCode'] = 'EXCEPTION';
		$response['errorMessage'] = $e->getMessage();
	}

	echo json_encode($response);
}
}